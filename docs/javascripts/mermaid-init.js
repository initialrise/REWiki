// Mermaid zoomable lightbox for MkDocs Material (SPA-aware).
// Material's bundle renders `pre.mermaid` into `div.mermaid` with the SVG
// inside a *closed* shadow root, so we cannot clone it back out. Instead we
// wrap `mermaid.render` to capture the SVG string Material produces, keep it
// in a FIFO queue, and associate each captured SVG with the next unwired
// .mermaid div in document order (renders complete in DOM order). Clicking a
// diagram opens a lightbox with a zoomable/pannable clone of that SVG.
(function () {
  // MkDocs Material re-executes extra_javascript on SPA navigations; without
  // this guard a second closure would hold an empty svg store while the
  // patched mermaid.render still writes to the first closure's queue.
  if (window.__mermaidLightboxInit) return;
  window.__mermaidLightboxInit = true;

  let patched = false;
  const svgByDiv = new WeakMap();
  const pendingSvgs = []; // FIFO of SVG elements awaiting a .mermaid div

  function svgStringToEl(svg) {
    if (!svg) return null;
    if (svg.nodeType === 1) return svg;
    if (typeof svg !== "string") return null;
    const holder = document.createElement("div");
    holder.innerHTML = svg;
    return holder.querySelector("svg");
  }

  function patchMermaid(m) {
    if (patched || !m || typeof m.render !== "function") return;
    patched = true;
    const origRender = m.render.bind(m);
    m.render = async function (...args) {
      const result = await origRender(...args);
      try {
        const svg =
          typeof result === "string"
            ? result
            : result && (result.svg || (result[0] && result[0].svg));
        const el = svgStringToEl(svg);
        if (el) pendingSvgs.push(el);
      } catch (_) {}
      return result;
    };
  }

  // Material loads mermaid lazily and renders almost immediately, so we
  // must have window.mermaid patched BEFORE its first render call. Inject
  // the vendored bundle if it has not loaded yet and patch right away;
  // Material's own loader then sees window.mermaid defined and skips its
  // unpkg fetch.
  function ensureMermaidScript() {
    if (window.mermaid) { patchMermaid(window.mermaid); return; }
    const src =
      document.querySelector('script[src*="mermaid.min.js"]')?.src ||
      "javascripts/vendor/mermaid.min.js";
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => patchMermaid(window.mermaid);
    document.head.appendChild(s);
  }
  ensureMermaidScript();
  // fallback poll in case the script loads slowly
  let tries = 0;
  const poll = setInterval(() => {
    if (window.mermaid) {
      patchMermaid(window.mermaid);
      clearInterval(poll);
    } else if (++tries > 600) {
      clearInterval(poll);
    }
  }, 20);

  // ---------- lightbox ----------
  let overlay = null;
  let overlaySvg = null;
  let scale = 1;
  let tx = 0,
    ty = 0;
  let dragging = false,
    startX = 0,
    startY = 0,
    baseX = 0,
    baseY = 0;

  function ensureOverlay() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.id = "mermaid-lightbox";
    overlay.innerHTML = `
      <div class="mlb-backdrop"></div>
      <div class="mlb-toolbar">
        <button class="mlb-btn" data-act="zoom-in" title="Zoom in">+</button>
        <button class="mlb-btn" data-act="zoom-out" title="Zoom out">&minus;</button>
        <button class="mlb-btn" data-act="reset" title="Reset fit</button>
        <span class="mlb-hint">scroll to zoom &middot; drag to pan &middot; Esc to close</span>
        <button class="mlb-btn mlb-close" data-act="close" title="Close">&times;</button>
      </div>
      <div class="mlb-stage"><div class="mlb-canvas"></div></div>`;
    document.body.appendChild(overlay);
    overlaySvg = overlay.querySelector(".mlb-canvas");

    overlay.querySelector(".mlb-backdrop").addEventListener("click", closeLightbox);
    overlay.querySelector('[data-act="close"]').addEventListener("click", closeLightbox);
    overlay.querySelector('[data-act="zoom-in"]').addEventListener("click", () => zoomBy(1.25));
    overlay.querySelector('[data-act="zoom-out"]').addEventListener("click", () => zoomBy(0.8));
    overlay.querySelector('[data-act="reset"]').addEventListener("click", resetView);

    overlay.addEventListener("wheel", (e) => {
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? 1.15 : 0.87);
    }, { passive: false });

    overlaySvg.addEventListener("pointerdown", (e) => {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      baseX = tx; baseY = ty;
      overlaySvg.setPointerCapture(e.pointerId);
      overlaySvg.classList.add("panning");
    });
    overlaySvg.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      tx = baseX + (e.clientX - startX);
      ty = baseY + (e.clientY - startY);
      applyTransform();
    });
    const endDrag = () => { dragging = false; overlaySvg.classList.remove("panning"); };
    overlaySvg.addEventListener("pointerup", endDrag);
    overlaySvg.addEventListener("pointercancel", endDrag);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && overlay.classList.contains("open")) closeLightbox();
    });
    return overlay;
  }

  function applyTransform() {
    if (overlaySvg.firstElementChild) {
      overlaySvg.firstElementChild.style.transform =
        `translate(${tx}px, ${ty}px) scale(${scale})`;
    }
  }

  function zoomBy(f) {
    scale = Math.min(20, Math.max(0.05, scale * f));
    applyTransform();
  }

  function fitView() {
    const svgEl = overlaySvg.firstElementChild;
    if (!svgEl) return;
    const stage = overlay.querySelector(".mlb-stage");
    const vb = svgEl.viewBox?.baseVal;
    const w = vb?.width || svgEl.getBoundingClientRect().width || 800;
    const h = vb?.height || svgEl.getBoundingClientRect().height || 600;
    const fit = Math.min(
      (stage.clientWidth - 40) / w,
      (stage.clientHeight - 40) / h,
      1.5
    );
    scale = Math.max(0.05, fit);
    tx = 0; ty = 0;
    applyTransform();
  }

  function resetView() {
    fitView();
  }

  async function openLightbox(sourceDiv) {
    let stored = svgByDiv.get(sourceDiv);
    // capture may still be in flight (render resolves after the div appears);
    // wait briefly, retrying the queue drain each pass
    for (let i = 0; i < 30 && !(stored && stored.nodeType); i++) {
      drainPending();
      await new Promise((r) => setTimeout(r, 100));
      stored = svgByDiv.get(sourceDiv);
    }
    if (!stored || !stored.nodeType) return;
    ensureOverlay();
    overlaySvg.innerHTML = "";
    const clone = stored.cloneNode(true);
    clone.removeAttribute("style");
    clone.style.maxWidth = "none";
    clone.style.width = "auto";
    clone.style.height = "auto";
    const vb = clone.viewBox?.baseVal;
    if (vb && vb.width && vb.height) {
      clone.setAttribute("width", vb.width);
      clone.setAttribute("height", vb.height);
    }
    overlaySvg.appendChild(clone);
    overlay.classList.add("open");
    document.body.style.overflow = "hidden";
    requestAnimationFrame(fitView);
  }

  function closeLightbox() {
    if (overlay) {
      overlay.classList.remove("open");
      document.body.style.overflow = "";
    }
  }

  // Associate captured SVGs (FIFO, render order == DOM order) with
  // .mermaid divs that have none yet.
  function drainPending() {
    if (!pendingSvgs.length) return;
    const divs = [...document.querySelectorAll(".mermaid")].filter(
      (d) => !svgByDiv.has(d)
    );
    while (pendingSvgs.length && divs.length) {
      svgByDiv.set(divs.shift(), pendingSvgs.shift());
    }
  }

  function wireZoomable(root) {
    drainPending();
    root.querySelectorAll(".mermaid").forEach((div) => {
      if (div.dataset.zoomWired) return;
      div.dataset.zoomWired = "1";
      div.classList.add("zoomable");
      div.title = "Click to enlarge";
      div.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        openLightbox(div);
      });
    });
  }

  // Wire diagrams as Material renders them. Renders resolve asynchronously
  // after the div is inserted, so re-wire on DOM mutations (SPA navigations
  // reuse this script) and on a couple of delayed passes.
  const observer = new MutationObserver(() => {
    wireZoomable(document);
  });
  function start() {
    const root = document.body || document.documentElement;
    if (!root) return;
    observer.observe(root, { childList: true, subtree: true });
    wireZoomable(document);
    setTimeout(() => wireZoomable(document), 800);
    setTimeout(() => wireZoomable(document), 2500);
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
