# Protocol Reverse Engineering

> Tags: pcap | PRE | fuzzing | wireshark | MCP | AI-assisted | Difficulty: intermediate | Prerequisites: Wireshark or tshark, Python 3.11+, an MCP-compatible agent client

Protocol reverse engineering (PRE) means recovering the structure of an unknown network protocol from observed traffic. In 2026 the practical workflow has split in two: deterministic engines do the grammar learning and the mutating, and the LLM writes hypotheses, reads dissectors, and drives the tools. The strongest published result on this division of labor is negative for the LLM part. The Moosa-Salehi pipeline (below) reports that optional LLM stages add no measurable gain on structure inference once statistical evidence gates are applied.

The AI role that does pay off is different: the model generates a grammar, a dissector, or a fuzz corpus, and a replay or a differential check verifies it. Everything the model claims is wrong until it parses the traffic.

## Overview

### What the tools do

| Tool | Input | Output | AI role |
|---|---|---|---|
| Substrat | pcap or text stream | Protocol grammar, anomaly list, Wireshark Lua dissector, fuzz corpus | LLM calls it through MCP. The engine stays deterministic |
| Moosa-Salehi `protocol_reverse_engineering` | pcap | Schema-validated protocol model, message-type and field-boundary inference, Wireshark Lua export | Optional LLM stages sit behind evidence gates. Reported result: LLMs add no measurable gain on structure |
| MARISSA | pcap | Clustered, aligned message formats | Deterministic front-end. Feeds an LLM or a grammar tool |
| ProtoForge | live TCP/UDP session or imported pcap | Framing and field inference, confidence scores, verified hypotheses, SQLite evidence store, state model | Verification-guided. The tool verifies its own guesses against the live target |
| Reverseloom | browser session | Reproduced signed or encrypted request generator, standalone crawler | End-to-end web API RE agent with CDP breakpoints |
| TracePcap | pcap | Device and topology inventory, session reconstruction, threat detection, AI narratives | LLM for narrative and Wireshark filter generation |
| Netzob | pcap | Inference, finite-state machine, fuzzing, dissector export | Foundation toolkit. Predates the LLM wave |
| Kaitai Struct | `.ksy` spec | Parser source in many languages | LLM writes or fixes the `.ksy` spec |
| wireshark-mcp, NetForensicMCP | pcap, live capture | Bounded packet summaries, field extraction, stream extraction | LLM gets a disciplined pcap interface instead of raw dumps |

### The honest split

Use deterministic tools for anything that must be correct: grammar discovery, field boundaries, checksum identification, mutation. Use the LLM for anything that needs judgment: reading obfuscated JavaScript, naming fields, writing a Wireshark Lua dissector, explaining an inferred state machine, and triaging anomalies.

The published evidence supports this split. Moosa-Salehi reports negative results in its own evaluation: the neural encoder does not transfer to unseen protocols, copying the nearest labeled message matches the few-shot predictor, and LLMs bring no measurable gain. Substrat's landing page states the same design position: "LLMs are a bad fit here: they hallucinate grammars and can't explain their reasoning." Treat that as a vendor claim. It agrees with the academic finding, but no independent head-to-head test exists.

## Setup

### Prerequisites

Install these once.

```bash
# Wireshark CLI tools. Required by almost every tool below.
sudo apt install wireshark-common tshark    # Debian/Ubuntu
brew install wireshark                       # macOS

# Python 3.11+ for Moosa-Salehi, MARISSA, ProtoForge, and most MCP servers.
python3.11 --version

# An MCP-compatible agent client. Claude Code, Codex CLI, and Cursor all work.
claude --version   # or: codex --version
```

Check that `tshark` works before you start:

```bash
tshark --version
tshark -r sample.pcap -q -z io,phs     # protocol hierarchy
```

### Tool setup

**Substrat.** Substrat is a single Rust binary distributed from its landing page at `https://nicolashedoire.github.io/substrat-landing`. There is no public source repository listed on the site. Binaries exist for macOS arm64, Linux x86_64, and Windows x86_64 under the `releases/` path on that site. The site states the software is proprietary and free during early access.

```bash
curl -L -o substrat-linux-x86_64 \
  https://nicolashedoire.github.io/substrat-landing/releases/substrat-linux-x86_64
chmod +x substrat-linux-x86_64
./substrat-linux-x86_64 info
```

**MCP registration for Substrat.** The binary takes a `mcp` argument. Register it with your client:

```bash
claude mcp add --scope user substrat /path/to/substrat-linux-x86_64 mcp
```

The site documents five MCP tools: `substrat_learn`, `substrat_compress`, `substrat_anomaly`, `substrat_generate`, and `substrat_re`. The CLI commands are `re`, `learn`, `anomaly`, `compress`, and `generate`.

**ProtoForge.** Install from the repository `github.com/cy3erm/ProtoForge`. Requires Python 3.11+. Runtime dependencies are `typer` and `rich`.

```bash
git clone https://github.com/cy3erm/ProtoForge.git
cd ProtoForge
pip install -e .
# optional:
pip install -e '.[pcap]'   # pcap import/export via scapy
pip install -e '.[dev]'    # pytest
```

**Moosa-Salehi pipeline.** Repository: `github.com/Moosa-Salehi/protocol_reverse_engineering`. Requires Python 3.10+, tshark, and the packages numpy, scikit-learn, hdbscan, scapy, and torch. The pipeline runs as `main.py` and has stage scripts `scripts/01` through `scripts/19`. Optional LLM stages read `config/llm_config.json`. The project publishes an 18-protocol ground-truth benchmark called ICS-PRE-18 under `benchmark/`.

**MARISSA.** Repository: `github.com/reverseame/MARISSA` (the README still points clones at `github.com/pruizlezcano/MARISSA`. Both paths resolve to the same project). Requires Python 3.11, Poetry, and at least one multiple-sequence-alignment tool: MAFFT, Clustal Omega, MUSCLE, or FAMSA. A Docker image ships with MAFFT only.

```bash
git clone https://github.com/reverseame/MARISSA.git
cd MARISSA
poetry install
marissa -i input.pcap --remove-duplicates --remove-headers -v
```

**wireshark-mcp.** Repository: `github.com/andsopwn/wireshark-mcp`. Python 3.11+. It is a local stdio MCP server. It wraps `dumpcap`, `tshark`, `capinfos`, `editcap`, `mergecap`, and `sharkd`.

```bash
pipx install git+https://github.com/andsopwn/wireshark-mcp.git
wireshark-mcp --install        # registers it as the "wireshark" MCP server in Codex
```

**NetForensicMCP.** Repository: `github.com/kylecui/NetForensicMCP` (formerly WireMCP). Node.js 16+ and tshark in PATH.

```bash
git clone https://github.com/kylecui/NetForensicMCP.git
cd NetForensicMCP
npm install
node index.js
```

Register it in the client's `mcp.json` with `command: "node"` and `args: ["/ABSOLUTE_PATH/NetForensicMCP/index.js"]`.

**TracePcap.** Repository: `github.com/NotYuSheng/TracePcap`. Spring Boot 6 plus React, PostgreSQL, and MinIO in Docker. Java 21. AI features need an OpenAI-compatible endpoint. The project requires that `LLM_API_BASE_URL` point to a self-hosted or LAN server, not a public API.

```bash
git clone https://github.com/NotYuSheng/TracePcap.git
cd TracePcap
cp .env.example .env
# set LLM_API_BASE_URL and LLM_MODEL in .env
docker compose up -d
# open http://localhost
```

**Kaitai Struct.** The language spec and compiler live at `kaitai.io` and `github.com/kaitai-io`. Current tag is `0.11`. The compiler binary is `ksc`. The format corpus is `github.com/kaitai-io/kaitai_struct_formats`. The Web IDE is `https://ide.kaitai.io/`.

```bash
# Debian package or binary from kaitai.io. Then compile a spec:
ksc -t python my_format.ksy
```

**Reverseloom.** Repository: `github.com/KuiChi-x/reverseloom`. Python 3.10+. It drives a local Chromium-family browser through patchright and the Chrome DevTools Protocol. Install:

```bash
git clone https://github.com/KuiChi-x/reverseloom.git
cd reverseloom
pip install -e .
python -m reverseloom          # desktop window
python -m reverseloom --web    # serve in a browser
```

The model must support image input and streaming output. Configure `BASE_URL`, `API_KEY`, and `MODEL` in Settings or `.env`. A Windows release zip exists at `releases/download/1.0.0/reverseloom_win.zip`. The project is marked alpha and builds on `graphloom` plus `kc-browser`.

## How It Works

### The PCAP-driven pipeline

A typical deterministic-first pipeline looks like this:

1. Capture or obtain a pcap. Prefer a capture with many sessions of the same service on one port.
2. Reduce the pcap. Remove retransmissions, keep one direction of each conversation, and split by service. Substrat works per flow. MARISSA and Moosa-Salehi take whole pcaps.
3. Run grammar induction. `substrat re capture.pcap --wireshark ./dissectors --fuzz ./fuzz` produces a grammar, a Lua dissector, anomaly list, and a fuzz corpus in one pass.
4. Verify the grammar by replay. Load the generated dissector into Wireshark and check that field boundaries match known anchors: magic bytes, length fields, checksums.
5. Fuzz the inferred grammar against the live target or a replay harness.
6. Iterate. Feed anomalies and crashes back into the model for a revised hypothesis.

### What each engine contributes

**Substrat** learns a grammar from pcap text flows and reports coverage as a percentage. Its documented output for a MODBUS capture shows a grammar like `MSG -> MAGIC_0 DATA_1 FIXED_2 TYPE_3 DATA_4 FIXED_5 DATA_6` with literal values for the fixed fields and alternatives for the variable ones. It generates three fuzz strategies: `field_flip`, `boundary`, and `structural`. The site claims grammar coverage of 94 percent on MODBUS. That is a vendor-reported benchmark number. It is plausible but unverified by an independent test.

**Moosa-Salehi** is the most academically rigorous option. It runs 19 pipeline stages. Stages cover message-type discovery through clustering plus label-free refinement, hierarchical field-boundary inference, TLV and BER parsing, array detection, CRC blocks, request/response pairing, echo fields, and length relations. Output is a schema-validated protocol model plus Markdown and interactive HTML reports. The evaluation uses 14 benchmark protocols and 4 held-out protocols. Reported scores: rules-only 0.454 overall, zero-shot 0.513, few-shot with 50 labeled messages 0.620. Per-message boundary F1 in zero-shot mode is 0.633, against 0.474 for the best of NEMESYS, Netzob, and NetPlier. A 200,000-message single-device Modbus capture is recovered completely in about 9 minutes on a laptop. These numbers come from the project's own paper. They are self-reported.

**MARISSA** clusters similar packets with similarity digests (ssdeep, TLSH, or Hamming) and aligns them with a multiple-sequence-alignment tool. Use it when you want clustered message families before grammar inference. It is GPLv3 and research-grade. Expect to install MAFFT and to read its output format.

**ProtoForge** works on live sessions, not only pcaps. Its command loop is `connect → record → inspect → infer → verify → replay → mutate → fuzz → minimize`. Every inference carries a confidence score. The `verify` command actively probes the live target and returns VERIFIED, SUPPORTED, or REFUTED per hypothesis. All state lives in one SQLite file with JSON, raw, pcap, and Graphviz DOT exports.

**Reverseloom** targets a different problem: web protocols where the client signs or encrypts requests in JavaScript. It gives the LLM full browser exposure (DOM, screenshot, network, JS debugger) instead of screenshots only. It sets CDP breakpoints inside the request generator, reproduces the algorithm in a Node sandbox, and requires five-of-five cold-start replays before it ships a standalone crawler. The README claims a hands-off run against Akamai Bot Manager. That is a vendor demonstration, not an independent benchmark.

**TracePcap** is for black-box forensics, not grammar learning. It reconstructs devices, topology, sessions, and threats from pcaps with no prior network knowledge. Its AI features are Story Mode narratives and a Wireshark filter generator. Use it for triage and reporting. Do not expect it to emit a protocol grammar.

### Encrypted and signed protocols

Three cases come up in practice.

**TLS-encrypted payloads.** Grammar tools need cleartext. Substrat's FAQ states this directly: no grammar inference on TLS ciphertext. Options: capture on the plaintext side (server logs, an SSLKEYLOGFILE-enabled client, a decrypted capture), or target the TLS handshake itself. JA3 and JA4 fingerprint the handshake and identify the client. They do not describe the application protocol. The two are complementary.

To get cleartext from a TLS client you control, set `SSLKEYLOGFILE` before launch and point Wireshark at the keylog:

```bash
SSLKEYLOGFILE=/tmp/keys.log ./target-client
# In Wireshark: Edit → Preferences → Protocols → TLS → (Pre)-Master-Secret log filename
tshark -r capture.pcap -o tls.keylog_file:/tmp/keys.log -Y http2 -V
```

**Signed requests.** The signature is computed in the client. Traffic alone will not reveal the algorithm. This is the Reverseloom case: set a breakpoint in the signing function, dump the inputs and the pre-image, and reproduce the hash or HMAC in a sandbox. For a binary client, use Ghidra or IDA with an MCP server and apply the same breakpoint-and-dump method under a debugger instead.

**Obfuscated binary protocols with checksums.** The grammar learner will find the field boundaries but not the checksum polynomial. Treat checksum bytes as an unknown fixed-or-computed field. Generate candidate CRC widths and polynomials from the data, or ask the LLM to propose candidates and verify each by recomputation against the pcap. Do not trust a checksum claim until at least 95 percent of messages verify.

## Step-by-Step

### A. Grammar discovery from a pcap with Substrat

```bash
# 1. Capture or reduce the pcap first.
tshark -r raw.pcap -Y 'tcp.port==9001 && tcp.len>0' -w service.pcap

# 2. Run the full pipeline.
./substrat re service.pcap --wireshark ./dissectors --fuzz ./fuzz --fuzz-count 1000
```

Expected output per the docs: a grammar listing, anomaly count, a `.lua` file in `./dissectors/`, and `.bin` files in `./fuzz/` ready to send.

Load the dissector in Wireshark:

```lua
-- In Wireshark: Analyze → Enabled Protocols → New → point at the .lua file
-- Or copy to the personal plugins folder:
-- ~/.local/lib/wireshark/plugins/  (Linux)
-- ~/Library/Preferences/Wireshark/plugins/  (macOS)
```

Verify coverage. The tool reports a coverage percentage. Below roughly 80 percent, split the capture by message type or direction and rerun. Mixing request and response flows in one grammar is the most common cause of low coverage.

### B. Deep inference with the Moosa-Salehi pipeline

```bash
cd protocol_reverse_engineering
git clone https://github.com/Moosa-Salehi/protocol_reverse_engineering.git
cd protocol_reverse_engineering
python3.11 -m venv .venv && source .venv/bin/activate
pip install numpy scikit-learn hdbscan scapy torch
cp config/llm_config.example.json config/llm_config.json   # if present; check config/ for the real filename
python main.py --pcap path/to/capture.pcap
```

Check `docs/getting_started.md` and `docs/architecture.md` in the repo for exact flags. The pipeline writes intermediate artifacts to `data/`, logs to `logs/`, and final reports to `output/`. The protocol model is schema-validated JSON under `assets/schema/`. The evaluation harness and ground truth live in `benchmark/`.

Run the benchmark to see where the tool stands before you trust it on your target:

```bash
# docs/reproducing.md describes regeneration of published numbers.
# The ICS-PRE-18 benchmark covers Modbus, DNP3, S7comm, MMS, BACnet/IP,
# EtherNet/IP, OPC UA, and others.
```

### C. Live-session inference and verification with ProtoForge

```bash
protoforge connect 10.10.10.20:9001
# inside the shell:
#   /send cafe00020141
#   /sendtext HELLO
#   /recv
#   /quit

protoforge inspect smoke
protoforge show smoke 5
protoforge verify smoke          # probes the live target: VERIFIED/SUPPORTED/REFUTED
protoforge replay smoke --message 5
protoforge fuzz smoke --message 5 --cases 5000 --rate 50 --seed 1234 --prefix-text HELLO
protoforge state smoke --export state.dot
```

The `verify` step is the point of this tool. It converts inferred framing and checksum hypotheses into tested claims against the live service. Always run it before fuzzing. Fuzzing on a wrong framing hypothesis wastes the run.

### D. Clustering first with MARISSA

```bash
poetry install
marissa -i input.pcap --remove-duplicates --remove-headers -v \
  --distance-algorithm ssdeep --cluster-algorithm optics
```

Output lands in `./results/<pcap_name>/`. Use the clusters to split the pcap by message family, then feed each family to Substrat or Moosa-Salehi. MARISSA finds families. It does not emit field grammars.

### E. The LLM step: hypothesis generation, verified by replay

This is where the model earns its keep. Give the agent the evidence, not the raw pcap.

1. Export bounded evidence first. Use `tshark` fields, `packets_summary` from wireshark-mcp, or `protoforge show` output. Never paste a full pcap into the context.
2. Ask for a hypothesis in a checkable form.

```
You are analyzing a binary TCP protocol on port 9001.
Here are 20 annotated messages from protoforge inspect output:
<paste inspect output>

Produce:
1. A framing hypothesis: how to find message boundaries in a byte stream.
2. A field table: offset, width, endianness, candidate meaning.
3. A checksum hypothesis: algorithm, width, coverage range. Or "none found".
4. For each claim, the exact bytes in the evidence that support it.

Rules:
- Every claim must cite offsets from the pasted evidence.
- If the evidence does not support a claim, say UNKNOWN.
- Do not invent field names. Use candidate_* names.
```

3. Verify mechanically. For each claim, write a small parser and run it over the whole pcap or corpus. The verification script is the deliverable, not the prose.

```python
# verify_fields.py — run over every message, report parse rate
import struct, sys

def parse(msg: bytes):
    assert msg[0] == 0xCA and msg[1] == 0xFE   # framing claim
    mtype = msg[2]
    length = struct.unpack(">H", msg[3:5])[0]   # length claim, big-endian
    body = msg[5:5+length]
    return mtype, length, body

ok = 0; total = 0
for line in open("messages.hex"):
    msg = bytes.fromhex(line.strip())
    total += 1
    try:
        parse(msg); ok += 1
    except Exception:
        pass
print(f"{ok}/{total} parsed")
```

4. Feed failures back. The messages that fail parsing are the next hypothesis input. This loop — model proposes, script disposes — is the only LLM workflow with published support in this domain.

5. For the dissector, have the model write Lua against the verified field table, then load it and diff its output against `tshark -V` on the same packets.

### F. Fuzzing the inferred grammar

Two levels exist.

**Corpus-level fuzzing (no live target).** Substrat emits `.bin` packets under three strategies. Replay them through a harness that feeds a local server or a recorded responder. MARISSA and Netzob produce similar corpora. This finds parser crashes in your own implementation.

**Live-target fuzzing.** ProtoForge's `fuzz` command does field-aware mutation with deterministic seeds:

```bash
protoforge fuzz smoke --message 5 --cases 5000 --rate 50 --seed 1234 \
    --prefix-text HELLO
protoforge runs
protoforge show-case <run> <case>
protoforge minimize-case <run> <case>     # shrink to smallest trigger
protoforge replay-case <run> <case>       # reproduce
```

Determinism matters. Same seed gives the same mutant sequence, so a crash reproduces. Every finding exports as a replayable JSON repro. Use `--prefix` to establish protocol state (authentication, handshake) before each case. Single-shot mutations rarely reach gated message types.

**Grammar-based fuzzing with the model.** Once the field table is verified, the model can generate structure-aware mutations the deterministic engines miss: valid framing with semantically wrong values, boundary lengths, nested TLV depth attacks. Write the mutator yourself or have the model write it, then verify each mutant still parses under your verified grammar. Mutants that fail the grammar are noise. Mutants that parse but crash the target are findings.

### G. Web API protocols with Reverseloom

For signed or encrypted web requests, traffic analysis is the wrong tool. Use Reverseloom or an equivalent CDP-driven agent.

```bash
git clone https://github.com/KuiChi-x/reverseloom.git
cd reverseloom
pip install -e .
python -m reverseloom --web
```

Configure the model in Settings. The model needs image input and streaming. Then prompt it with the target URL and the goal, for example "write a crawler for this site's price API." The agent navigates, sets breakpoints in the request generator (`set_line_breakpoint`, `break_on_request`), dumps runtime assets (`dump_runtime_asset`, `search_in_js_codes`), and reproduces the signing algorithm in a Node sandbox. It requires five-of-five cold-start replays before it ships the standalone crawler.

Treat the deliverable as a hypothesis too. Run the generated crawler against the live site on a different day and confirm the signatures still verify. Akamai-class bot managers rotate sensor payloads. A reproduced generator can go stale within hours.

## Pitfalls

- **Plausible grammar, wrong grammar.** An LLM will produce a grammar that looks right and parses 90 percent of messages. The 10 percent are usually a second message type you merged into the first. Always report parse rate over the full corpus, not a sample.
- **Mixing directions and message types.** Grammar learners assume one grammar per input. Split by direction, port, and first-byte discriminator before learning. Moosa-Salehi does this internally with clustering. Substrat works per flow. MARISSA clusters for you.
- **Encryption makes everything downstream impossible.** No grammar tool reads TLS ciphertext. Resolve the cleartext question first: keylog, server-side capture, or plaintext protocol.
- **Checksums look like fixed fields.** A CRC over the body will appear as a "fixed" 2- or 4-byte trailer until enough messages vary. Verify checksum candidates by recomputation, not by eye.
- **Length fields lie under fragmentation.** TCP segmentation splits messages. Reassemble streams before inference. `tshark -z follow,tcp,raw,<stream>` or tshark's `tcp.desegment_tcp_streams` preference handles most cases.
- **Vendor benchmark numbers are self-reported.** Substrat's 94 percent MODBUS coverage, Moosa-Salehi's F1 scores, and Reverseloom's Akamai run all come from the projects themselves. No independent replication exists. Reproduce on your own capture before relying on them.
- **Substrat is closed-source early access.** Binaries come from a GitHub Pages site. No source repository is listed. Auditability claims ("deterministic, auditable") are vendor claims. The MCP tool names and CLI flags are documented. The internals are not.
- **Prompt injection through packet payloads.** A pcap can contain strings crafted to hijack the agent. The documented attacks in this space (arXiv 2605.30667, 2605.30677) show injection strings surviving compilation and reaching decompiler output. Apply the same rule as for binaries: the agent reads summaries and evidence, never raw payloads in bulk, and every claim is verified mechanically.
- **MCP scope creep.** wireshark-mcp and NetForensicMCP expose live capture and file transforms. A compromised or careless agent can start captures or write files. Run MCP servers locally, review their tool lists, and keep `run_shell`-class tools away from untrusted targets.
- **Over-trusting the state model.** ProtoForge's `state` export and Moosa-Salehi's relation inference produce a request/response graph. It is a hypothesis. Check it against a second capture from a different client or session before documenting it.
- **Fuzzing without a scope check.** ProtoForge implements a target-scope allowlist that refuses public-internet addresses unless authorized. That is an operator safety net, not a security boundary. Get written authorization before fuzzing anything you do not own.

## See Also

- `../03-decomp/verification-loop.md` — the general verify-before-trust pattern for agent output
- `../05-tools/mcp-catalog.md` — MCP servers for Ghidra, IDA, and Binary Ninja
- `../02-collab/agent-orchestration-tools.md` — Claude Code, Codex CLI, and Cursor configuration
- `./firmware-iot-re.md` — firmware extraction and emulation that feeds pcaps into this pipeline
- `./protocol-reverse.md` — game protocol reversing, a common PRE use case
- `../07-advanced/ai-security-threats.md` — documented injection attacks on RE agents
