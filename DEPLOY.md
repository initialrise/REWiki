# Deploy

The wiki builds with [MkDocs Material](https://squidfunk.github.io/mkdocs-material/). Source is in `docs/`; output goes to `site/` (gitignored).

Live site: https://initialrise.github.io/REWiki/

## Preview locally

```bash
uvx --from mkdocs-material mkdocs serve      # http://127.0.0.1:8000
```

## Publish to GitHub Pages

```bash
uvx --from mkdocs-material mkdocs gh-deploy --strict
```

This builds the site and force-pushes it to the `gh-pages` branch.
Pages source: **Settings → Pages → Deploy from a branch → `gh-pages` / (root)**.

## Docker (optional)

```bash
docker build -t rewiki .
docker run --rm -v "$PWD/site:/out" rewiki cp -r /docs/site/. /out/
```
