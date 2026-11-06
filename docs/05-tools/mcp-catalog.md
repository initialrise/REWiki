# MCP Server Catalog: Every Bridge That Matters

> Tags: mcp, ghidra, ida, binary-ninja, radare2, x64dbg, frida, jadx, angr, catalog | Difficulty: Intermediate | Prerequisites: an MCP client (Claude Code, Codex, Cursor, or similar), one analysis tool installed

## Overview

MCP (Model Context Protocol) is the standard bridge between an AI agent and a reverse engineering tool. The agent calls tools such as `decompile_function` or `set_breakpoint`. The tool executes them on the real binary.

Two families exist. Official servers come from the tool vendor. Community servers are written by users. Both matter. Vendor servers get maintenance and documentation. Community servers often expose more operations.

Pick one server per analysis tool. Do not run every server at once. Each server adds tool descriptions to the agent context. More tools means more tokens and more ways for the model to pick wrong.

The market is crowded. This page lists the servers that matter as of November 2026. Star counts are GitHub values at that date. They change. Verify before you rely on them.

## Setup

Most RE MCP servers install through `uvx`, `pip`, `npm`, or a plugin zip. The agent side needs one entry in the MCP client config.

### Claude Code example

Add a stdio server:

```bash
claude mcp add ghidra-mcp -- uvx --from git+https://github.com/LaurieWired/GhidraMCP ghidra-mcp
```

Add an HTTP server:

```bash
claude mcp add --transport http ida-mcp http://127.0.0.1:13337/mcp
```

### Generic JSON config

Most clients accept this shape:

```json
{
  "mcpServers": {
    "ghidra": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/LaurieWired/GhidraMCP", "ghidra-mcp"]
    },
    "ida": {
      "command": "uvx",
      "args": ["ida-hcli", "mcp", "serve"]
    }
  }
}
```

For HTTP transports, use the `url` field and a `headers` field for bearer tokens.

## Official and Vendor Servers

### Hex-Rays IDA MCP

Repo: `github.com/HexRaysSA/ida-mcp`. Announced September 2026. About 1,540 stars at last check.

Requirements: IDA 9.4 or later with idalib, Python 3.11 or later.

Install:

```bash
uvx ida-hcli mcp install
```

Architecture: "code mode." Only a few tools are exposed. `open_database`, `execute_python`, and documentation search. The agent writes IDAPython code instead of calling one tool per operation. Hex-Rays claims about 20 percent fewer tokens than community servers on an internal benchmark. That claim is unverified outside Hex-Rays.

Other features: `ida-nexus` lets multiple agents and the GUI share one IDB live. Headless mode runs through idalib workers with no GUI. Analysis itself needs no network.

Vendor guidance from Hex-Rays: Opus-class models through Claude Code. GPT-class through Codex. DeepSeek, Gemini, Kimi, and GLM through OpenRouter. A 27B Qwen model runs on a 24GB GPU but was reported to get stuck and overthink.

This is the recommended IDA MCP. The community server below defers to it.

### Binary Ninja native MCP

Docs: `docs.binary.ninja/guide/mcp.html`. Released September 2026 with Binary Ninja 6.0 "Krypton."

Two variants exist:

- GUI server inside the app over HTTP. All editions including free. Default `http://127.0.0.1:24642/mcp` with a bearer token.
- Headless `binaryninja_mcp` over stdio. Commercial and Ultimate editions only. macOS and Linux only.

Tools: disassembly, Pseudo C (HLIL), MLIL, LLIL, function metadata, types, and memory reads.

This ended the third-party plugin era for Binary Ninja. New projects should use the native server.

### JEB

No official JEB MCP was verified. Community options exist:

- `github.com/flankerhqd/jebmcp` — about 260 stars. JEB Pro as MCP.
- `github.com/dPhoeniixx/dJEB_mcp_server` — Claude Desktop integration for APK work.
- `github.com/d4rkmen/jeb-mcp-ext` — JEB decompiler plugin with MCP tweaks.

Status: unverified beyond repository existence. Test before use.

## IDA Pro Community Servers

| Server | Repo | Note |
|---|---|---|
| ida-pro-mcp | `github.com/mrexodia/ida-pro-mcp` | About 13,400 stars. The community server that started the wave. About 50 tools: decompile, disassemble, xrefs, patch, types, `py_eval`. Debugger tools behind `?ext=dbg`. `idalib-mcp` keeps persistent idalib workers per database. Now recommends the official Hex-Rays server. Companion dataset: `mrexodia/mcp-reversing-dataset`. |
| ida-mcp-rs | `github.com/blacktop/ida-mcp-rs` | Rust headless IDA MCP. About 900 stars. Lean profile claims 25 percent token cut. Tracks IDA 9.5. |
| ida-multi-mcp | `github.com/MeroZemory/ida-multi-mcp` | Multi-instance IDA MCP. BCSD function-similarity search across binaries. |
| re-mcp | `github.com/jtsylve/re-mcp` | Unified IDA plus Ghidra MCP with shared tool names. |
| ida-free-mcp | `github.com/0xshlomil/ida-free-mcp` | MCP for IDA Free through a C++ plugin. HTTP transport. |
| IDA-NO-MCP | `github.com/P4nda0s/IDA-NO-MCP` | Exports IDA decompilation to plain files for AI IDEs. Anti-MCP approach. No live bridge. |
| idac | `github.com/trailofbits/idac` | IDA CLI for agents from Trail of Bits. Nexus-based. JSON output. Alpha status. |

## Ghidra Servers

The Ghidra MCP space is the most crowded. These are the ones that matter.

### LaurieWired/GhidraMCP

Repo: `github.com/LaurieWired/GhidraMCP`. About 11,800 stars. Apache-2.0. The original and most-starred Ghidra MCP.

Requires Ghidra 12.1.4.

Install:

```bash
uvx --from git+https://github.com/LaurieWired/GhidraMCP ghidra-mcp
```

Features: decompile, rename, list methods, imports, exports.

v2.0 (October 2026) added headless PyGhidra mode. `ghidra-mcp --headless --binary ...` needs no GUI. Transports: stdio and streamable HTTP.

Security issues are documented in GitHub issues #140 and #141: unauthenticated HTTP server, prompt injection through decompiled output, and persistent stored injection through comment write-back. Read the Pitfalls section before you expose the HTTP port.

### bethington/ghidra-mcp

Repo: `github.com/bethington/ghidra-mcp`. About 6,100 stars. Very actively developed (v7.x in 2026).

Features: 219 MCP tools, the most complete Ghidra bridge. GUI plugin plus headless server. Lazy tool loading, batch operations, P-code emulation, live debugger integration, PCode-graph dataflow, Ghidra Server integration, Docker deployment.

Requires Ghidra 12.1.4 and Java 21.

Install: `uv tool install` of the release wheel after installing the Ghidra extension zip. Check the repository README for the current wheel name.

Caveat: the lineage between this project and LaurieWired's is unclear. Both are maintained. Pick one and verify Ghidra 12.2 compatibility.

### cyberkaida/reverse-engineering-assistant (ReVa)

Repo: `github.com/cyberkaida/reverse-engineering-assistant`. About 940 stars. PyPI package: `reverse-engineering-assistant`.

Design: deliberately small tools to fight context rot and hallucination.

Features: Ghidra extension, assistant mode on port 8080, headless mode for CI, bundled skills (`binary-triage`, `deep-analysis`, `crypto`, `ctf-rev`, `ctf-pwn`, `ctf-crypto`).

Why it matters: the anti-hallucination design is the most thoughtful in the Ghidra space.

### Other Ghidra MCP servers

| Server | Repo | Note |
|---|---|---|
| pyghidra-mcp | `github.com/clearbluejar/pyghidra-mcp` | About 460 stars. Headless PyGhidra MCP. ChromaDB semantic search over decompiled code. GHCR image available. |
| GhidrAssistMCP | `github.com/symgraph/GhidrAssistMCP` | 100 tools. Native Java MCP. Headless `analyzeHeadless` mode. Agent_lab sandbox profile. |
| GhidrAssist | `github.com/symgraph/GhidrAssist` | LLM assistant inside Ghidra. MCP client, not server. Any OpenAI-compatible endpoint including Ollama. |
| ghidra-headless-mcp | `github.com/mrphrazer/ghidra-headless-mcp` | About 200 stars. 212 tools. Headless only. Read-only default. The `ghidra.eval` escape hatch is dangerous on untrusted binaries. |
| Ryuumonbuchi | `github.com/elliottophellia/Ryuumonbuchi` | 217 tools. Persistent JVM worker child avoids per-call startup cost. |
| ghidra-rpc | `github.com/cellebrite-labs/ghidra-rpc` | Ghidra as daemon. JSON CLI. Agent-agnostic. Decompile, xrefs, rename, retype, patch, BSim diff. |
| ghidrallm-mcp | `github.com/jumpeip/ghidrallm-mcp` | In-Ghidra HTTP MCP. 70 tools including `emulate` for pcode-level execution. |
| ghidra-cli | `github.com/akiselev/ghidra-cli` | Rust CLI driving a persistent Ghidra bridge. JSON output. Sub-second queries. Ships a first-party skill. |
| OGHidra | `github.com/llnl/OGhidra` | LLNL's Ollama plus Ghidra bridge. Local models. RAG over functions. |

## Binary Ninja Community Servers

The native 6.0 server above is the default. Community options remain for older versions or headless pipelines.

| Server | Repo | Note |
|---|---|---|
| binary_ninja_mcp | `github.com/fosdickio/binary_ninja_mcp` | BN plugin plus HTTP endpoints. About 50 tools. Largely superseded by native 6.0 MCP. |
| binary-ninja-headless-mcp | `github.com/mrphrazer/binary-ninja-headless-mcp` | 181 tools. Headless. Read-only default. Undo/redo transactions. CI-tested. |
| bn | `github.com/banteg/bn` | CLI socket bridge into the open GUI. Works with personal license. Installs a Codex skill. |
| Sidekick | `sidekick.binary.ninja` | Commercial AI agent layer inside Binary Ninja. Multi-agent pipeline with a validation agent. Transaction log where every agent edit is revertable. BYO model endpoints including Ollama and vLLM. Most productized option. |

## radare2, rizin, and Cutter

| Server | Repo | Note |
|---|---|---|
| radare2-mcp (r2mcp) | `github.com/radareorg/radare2-mcp` | Official r2 MCP in C. About 350 stars. Stdio, r2 core plugin HTTP, r2pipe attach. Session multiplexing. Readonly and sandbox modes. |
| r2ai | `github.com/radareorg/r2ai` | r2 plugin for LLM prompts. ReAct mode. Local and remote models. RAG vector DB. Not an MCP server itself. |
| radare2-mcp (drvcvt) | `github.com/drvcvt/radare2-mcp` | TypeScript. 85 tools over radare2 and Rizin. |

Cutter has no mature AI integration. The only Cutter-native AI plugin found (`gavrh/stutter`) is a one-author hobby project. r2ai and r2mcp work on the rizin/radare2 core that Cutter embeds.

## Debuggers and Dynamic Analysis

| Server | Repo | Note |
|---|---|---|
| x64dbg-mcp-server | `github.com/duty1g/x64dbg-mcp-server` | About 2,800 stars. Native Zig x64dbg plugin over HTTP. Zero dependencies, single binary. Set breakpoints, step, read memory, dump registers. The most-starred debugger MCP. |
| x64DbgMCPServer | `github.com/AgentSmithers/x64DbgMCPServer` | C# MCP for x64dbg. |
| x64dbg-mcp | `github.com/SetsunaYukiOvO/x64dbg-mcp` | JSON-RPC over HTTP and SSE. |
| WinDbgX-MCP | `github.com/mnemonic-re/WinDbgX-MCP` | MCP for WinDbg and WinDbgX. KDNET kernel debugging. Crash dump triage. Multi-session management. Pre-1.0. Described as prompt-injection hardened. |
| kahlo-mcp | `github.com/FuzzySecurity/kahlo-mcp` | About 140 stars. Frida session lifecycle MCP. Versioned module store. The most serious Frida MCP found. |
| frida-mcp | `github.com/dnakov/frida-mcp` | About 460 stars. Original stdio Frida MCP. Last commit May 2025. Stale but functional for simple hooks. |
| frida-c2-mcp | `github.com/s4dp4nd4/frida-c2-mcp` | On-device Frida MCP for Android and iOS. HTTP transport. |

## angr

angr 10.x ships its own MCP server. It is the only symbolic-execution engine with a first-party agent interface.

Install:

```bash
pip install "angr[llm]"
```

The extra pulls pydantic-ai, mcp, and fastmcp.

Run:

```bash
angr-mcp                          # stdio console script
python -m angr.mcp --transport sse   # or http
```

Tools: `load_binary`, `get_cfg`, `list_functions`, `get_basic_blocks`, `get_function`, `close_project`.

angr-management plugin: `github.com/sandbornm/angr_mcp` binds MCP tools to the live GUI session with symbolic-execution tools.

## Mobile: APK and dex

| Server | Repo | Note |
|---|---|---|
| jadx-ai-mcp | `github.com/zinja-coder/jadx-ai-mcp` | About 3,000 stars. JADX-GUI plugin exposing the live decompiler over HTTP. Rename, xref, debug, comments. |
| jadx-mcp-server | `github.com/zinja-coder/jadx-mcp-server` | Python FastMCP adapter. 34 tools. |
| apktool-mcp-server | `github.com/zinja-coder/apktool-mcp-server` | About 700 stars. apktool decode, build, and smali edit through MCP. |
| jadx-headless-mcp | `github.com/1013503897/jadx-headless-mcp` | Headless jadx-core MCP. 26 tools. Ships a Claude Code plugin. |
| revoid | `github.com/samudoria/revoid` | Headless jadx-core MCP plus call-graph index. |
| delamain | `github.com/xjoker/delamain` | Production headless JADX MCP. Docker. Bearer auth. Frida hook generation. |
| dexdec | `github.com/asLody/dexdec` | Rust decompiler workbench plus live MCP. Claimed higher fidelity than jadx. Unverified benchmark. |
| APKLab | `github.com/APKLab/APKLab` | VS Code workbench. Apktool plus jadx plus smali-lsp. Frida hook generation. |

## Firmware

Firmware tooling has thin MCP coverage.

- `github.com/Cossack9989/binwalk-mcp-server` — binwalk MCP server. About 3 stars. Unverified. Last update June 2026.
- No maintained unblob MCP server was found. Drive unblob through the agent shell instead. It emits JSON reports.
- `github.com/sjkim1127/Reversecore_MCP` wraps binwalk among 179 tools. See Multi-tool suites.
- Typical pipeline: agent runs `binwalk` or `unblob` in the shell, then opens carved files in Ghidra through the Ghidra MCP.

## Multi-tool Suites

These servers wrap many tools behind one endpoint. Powerful, but watch context cost.

| Server | Repo | Note |
|---|---|---|
| Reversecore_MCP | `github.com/sjkim1127/Reversecore_MCP` | About 220 stars. 179 tools wrapping radare2, r2ghidra, LIEF, Capstone, YARA, angr, DIE, capa, FLOSS, binwalk, Volatility3, Scapy. Security-first design. |
| jshookmcp | `github.com/vmoranv/jshookmcp` | About 2,100 stars. 735 tools across 36 domains. JS and web reversing focus. Profile ladder to manage context cost. |
| minusOne-mcp-reverse | `github.com/Ashibalt/minusOne-mcp-reverse` | 77 semantic ops. Dockerized static backends with `--network none`. Owner-armed dynamic plane. The most security-engineered design found. |
| dogbolt-mcp | `github.com/kadohack12/dogbolt-mcp` | MCP over dogbolt.org's public decompiler fleet. Privacy caveat: uploads are public. Do not send sensitive binaries. |
| Arkana | `github.com/JameZUK/Arkana` | About 260 stars. About 250 to 289 MCP tools. Angr, YARA, capa, FLOSS, Binary Refinery, Qiling. Malware-analysis lab behind one prompt. |
| REA | `github.com/morluto/rea` | `npx rea-agents setup`. One MCP server plus CLI. Covers Ghidra, IDA, Hopper, Kuna, JADX, Binwalk, Unblob, WASM, pcap, SQLite, HAR, IL2CPP, Godot. Findings carry evidence and provenance. Caution: star count claims are extraordinary and unverified. Independent evaluations found no significant solve-rate gain over plain agents at about 2x cost. Install only from the official repo. Clones circulate. |

Kong (`github.com/amruth-sn/kong`, PyPI `kong-re`) is not an MCP server. It is a deterministic five-phase Ghidra pipeline. Mentioned here because it competes for the same job. Reported result: reconstructed the CVE-2024-3094 XZ backdoor kill chain from stripped `liblzma` in about 15 minutes for about $6.63.

## Install One-Liners

```bash
# IDA (official)
uvx ida-hcli mcp install

# IDA (community, GUI plugin required)
uvx --from git+https://github.com/mrexodia/ida-pro-mcp ida-pro-mcp

# Ghidra (original)
uvx --from git+https://github.com/LaurieWired/GhidraMCP ghidra-mcp

# Ghidra (largest tool surface)
uv tool install ghidra-mcp   # after installing the Ghidra extension zip; see repo README

# Ghidra headless mode (LaurieWired v2)
ghidra-mcp --headless --binary /path/to/target

# Binary Ninja headless (Commercial/Ultimate, macOS/Linux)
binaryninja_mcp

# radare2 official
git clone https://github.com/radareorg/radare2-mcp && cd radare2-mcp && cargo build --release

# angr
pip install "angr[llm]" && angr-mcp

# APK suite
uvx --from git+https://github.com/zinja-coder/jadx-ai-mcp jadx-ai-mcp   # check repo for exact entry point

# REA multi-tool
npx rea-agents setup
```

Verify each entry point against the current README. Projects rename commands between releases.

## Pitfalls

### Security

Feed untrusted binaries to MCP servers and you create a documented attack surface. Reported attacks:

| Attack | Source | What happens |
|---|---|---|
| Prompt injection via compiled strings | arXiv 2605.30667 | Injection strings survive compilation. Mimic chat tokens. Fake decompiler output for a different target. 100 percent success with Qwen3-8B in the study |
| Obfuscated injection | arXiv 2605.30677 | Non-printing bytes hide payloads from `list_strings` while `decompile_function` still shows them |
| Semantic reframing | arXiv 2609.19722 (ALIBI) | Non-executed PE section with false "security product" narrative. 85.7 percent success on Gemini 2.5 Pro |
| GhidraMCP audit | issues #140/#141 | Unauthenticated HTTP server. Prompt injection through decompiled output. Persistent stored injection through comment write-back |
| Tool poisoning | Trail of Bits, April 2025 | Malicious MCP tool descriptions inject instructions before any tool is invoked |
| Rug pull | Microsoft, April 2025 | Hosted MCP servers can amend tool definitions after approval |

Rules that follow from this evidence:

1. Prefer stdio transport on localhost. Never bind an MCP HTTP port to a non-loopback interface. GhidraMCP's HTTP server is unauthenticated.
2. Use read-only modes during untrusted-binary sessions. Disable rename and comment write-back tools. Stored injection through comments is demonstrated.
3. Run the agent and MCP servers inside Docker, gVisor, or a VM. No production credentials. Egress allowlist.
4. Vet servers before install. Tool poisoning and rug pulls are documented. Prefer pinned versions and reviewed repos.
5. Treat every tool output as untrusted data. Never let decompiler output authorize further tool calls.
6. For hostile samples, prefer local models. Air-gap removes exfiltration. Cost: weaker models are more injectable.
7. Update Ghidra. GHSA-mc3p-mq2p-xw6v (malicious Mach-O CFStrings with `{@execute}` annotations, arbitrary code execution on comment click) is fixed in Ghidra 12.0.3 and later.

Scanners and gateways for the agent layer: AgentSeal (`github.com/getagentseal/agentseal`), mcp-fence (`github.com/DaoyuanLi2816/mcp-fence`), mcpjail (mcpjail.com), Docker MCP Gateway (`github.com/docker/mcp-gateway`), LlamaFirewall PromptGuard 2 (`github.com/meta-llama/PurpleLlama`).

### Practical pitfalls

- Context bloat. bethington's 219 tools and jshookmcp's 735 tools flood the context window. Use lazy tool loading, profile ladders, or a smaller server for focused work.
- Version drift. Most Ghidra MCP servers pin Ghidra 12.1.4. Ghidra 12.2 compatibility is unverified for several. Check the repo issues before upgrading.
- Duplicate servers. LaurieWired/GhidraMCP and bethington/ghidra-mcp overlap heavily. Running both doubles tool count for no gain.
- GUI dependence. Many servers need the analysis GUI open. For CI or batch work, pick a headless variant: `--headless` PyGhidra mode, `idalib-mcp`, `binaryninja_mcp`, or `analyzeHeadless`.
- Star counts mislead. morluto/rea shows an extraordinary star count that is unverified. jadx-ai-mcp at about 3,000 stars is the exception that proves the rule: check commit activity, not stars.
- Escape hatches. `ghidra.eval` in ghidra-headless-mcp and `py_eval` in ida-pro-mcp run arbitrary code. Never expose them to untrusted binaries.
- Public decompilers. dogbolt-mcp uploads binaries to a public service. Do not use it on confidential targets.

## See Also

- `../01-setup/agent-sandboxing.md` — isolating the agent and MCP layer
- `../03-decomp/verification-loop.md` — deterministic verification of agent output
- `./mcp-catalog.md` — headless Ghidra analysis patterns
- `../07-advanced/ai-security-threats.md` — prompt injection research in depth
- `../06-topics/firmware-iot-re.md` — firmware extraction pipeline that feeds these MCP servers
