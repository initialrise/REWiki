# AI-Assisted Reverse Engineering in 2026
## A Deep-Research Report for the Working Reverse Engineer

Date of research: 2026-11-05.
Scope: best setup for reverse engineering software, tools, firmware, and games in 2026 with AI.
Method: 32 parallel research agents surveyed primary sources. GitHub, arXiv, official documentation, benchmark sites, and practitioner reports were the sources.

This report uses Simplified Technical English (ASD-STE100) rules as a style guide. Sentences are short. One idea goes in one sentence. Technical terms keep their normal names.

---

## 0. What This Report Did NOT Establish

Read this section first. It is the most important section in the report.

- No agent tested the tools end to end. The research read repositories, papers, and documentation. It did not install Ghidra, IDA, Binary Ninja, or any MCP server.
- Star counts on GitHub are unreliable in 2026. Several projects show star counts that do not match their age. The project `morluto/rea` shows a claimed count near 430,000 stars on a repository created in April 2026. Treat all popularity numbers as approximate.
- Vendor claims were not verified. Claims from Hex-Rays, Binary Ninja, REA, VirusTotal, and the DARPA AIxCC teams come from their own publications. Independent replication is rare.
- Benchmark results come from different tasks. A score on a crackme benchmark does not predict a score on a stripped malware binary. A score on assembly-to-C decompilation does not predict a score on protocol reverse engineering.
- Several 2026 papers and repositories were found but not fully read. Paper abstracts and repository READMEs were the main evidence. Some claimed code releases were not confirmed.
- The security findings come from papers and issue trackers. No agent reproduced an attack. The defenses are recommendations, not tested products.
- The report does not give legal advice. Reverse engineering legality depends on jurisdiction, license terms, and purpose. Check local law and the target's license before you analyze.
- Prices and model names change fast. Model names such as GPT-6, Claude Opus 5.5, Gemini 4, and Kimi K3 come from 2026 sources. Verify current names and prices before you budget.
- Local-model quality claims are estimates. No published head-to-head test compares local models against frontier models on realistic binaries.

---

## 1. Executive Summary

### 1.1 The main change in 2026

The main change is not a better decompiler. The main change is the **agent harness**.

In 2024, the workflow was: open IDA or Ghidra, read pseudocode, write notes by hand.
In 2026, the workflow is: give a coding agent (Claude Code, Codex, Cursor, or another MCP client) access to the binary through an MCP server or a skill pack, and let the agent drive the tools.

MCP (Model Context Protocol) became the standard interface. Every major analysis tool now has at least one MCP server. The commercial tools shipped official servers in 2026.

### 1.2 The recommended stack

For a reverse engineer who wants to add AI to the workflow, the evidence supports this stack:

| Layer | Recommended tool | Why |
|---|---|---|
| Agent harness | Claude Code or Codex CLI | Best MCP support and skill support in 2026 |
| Binary bridge | Official IDA MCP (Hex-Rays) or bethington/ghidra-mcp | Official vendor support. Most tools exposed |
| Analysis engine | IDA Pro 9.5, Ghidra 12.2, or Binary Ninja 6.0 | All three now have agent interfaces |
| Skills | reverse-skill, ReVa skills, or the skills for your specific task | Skills teach the agent your workflow |
| Verification | reverify, objdiff, compile-and-test loops | Agents hallucinate. Deterministic checks do not |
| Isolation | Docker or a VM for untrusted binaries | Prompt injection from binaries is documented |

### 1.3 The honest bottom line

- AI helps beginners the most. A controlled study (NDSS 2026, "Decompiling the Synergy") found novice comprehension improved by about 98 percent with LLM help. Experts gained little.
- AI is weak at open-ended questions. "Find the vulnerability" prompts produced hallucinated answers and wasted time in measured studies.
- AI is strong at bounded tasks. Decompile this function. Rename these symbols. Write this Frida script. Explain this control-flow graph.
- AI agents still fail on hard targets. On SRE-Bench, the best models solved about 27 to 32 percent of instances fully. On real malware benchmarks, success rates were in the low single digits.
- Verification is mandatory. Every reliable workflow has a deterministic check: compile the code, run the binary, diff the output, or check the claim against the bytes.

### 1.4 What the reader should do first

1. Pick one bounded task. Examples: rename functions in a stripped binary, deobfuscate one VM-protected function, write one Frida hook.
2. Set up the MCP bridge for your existing tool. Do not buy new software first.
3. Run the task with the agent. Check every claim against the binary.
4. Add a verification step. Compile the candidate code. Run the candidate. Compare the output.
5. Only then scale to larger tasks.

---

## 2. How This Research Was Done

### 2.1 Method

Thirty-two research agents worked in parallel. Each agent had one topic. Each agent used web fetches against search and read proxies, plus direct repository and paper access.

The topics covered:

- Agent harnesses and MCP servers
- Agent skills and skill packaging
- Decompilers and disassemblers
- Neural decompilation models
- Dynamic analysis and instrumentation
- Symbolic execution and SMT solvers
- Game decompilation and recompilation
- Firmware and embedded systems
- Mobile and .NET/Java/Go/Rust binaries
- Malware analysis with LLMs
- Protocol and format reverse engineering
- Deobfuscation
- Sandboxed and isolated environments
- Cloud-based RE infrastructure
- AI safety and prompt injection
- Models and benchmarks
- Learning resources

### 2.2 Evidence quality

The report uses three kinds of evidence:

| Kind | Examples | Strength |
|---|---|---|
| Primary sources | GitHub repos, official docs, arXiv papers | Strong for what exists |
| Benchmarks | SRE-Bench, DecBench, Retrobench, AgentRE-Bench | Strong for measured capability |
| Vendor claims | Hex-Rays, REA, Binary Ninja, VirusTotal | Weak. Treat as marketing |

Every tool entry gives a URL. Every benchmark entry gives a URL. Every claim that matters has a source.

### 2.3 Known limits of the method

- No code was run. Install steps come from documentation.
- Search coverage was incomplete. Some niche tools were missed.
- Star counts and dates are point-in-time. They change daily.
- Some 2026 arXiv identifiers are very new. Abstracts were read. Full papers were not always read.
- The report favors English-language sources. Several large skill repositories are Chinese-first.

---

## 3. The Agent Harness Layer

This is the most important section. The harness is the layer between the model and the binary.

### 3.1 What a harness is

A harness is the software that connects an LLM to tools. In 2026, three patterns dominate:

| Pattern | How it works | Examples |
|---|---|---|
| MCP server | The tool exposes an MCP endpoint. The agent calls it | ida-mcp, GhidraMCP, ghidra-mcp, x64dbg-mcp |
| Skill pack | The agent reads instructions and uses normal tools | reverse-skill, ReVa skills, headless-ghidra skills |
| In-tool agent | The agent lives inside the RE tool | Rikugan, GhidrAssist, Binary Ninja Sidekick, IDA Assist |

### 3.2 Coding-agent harnesses

These are the general-purpose agents that drive RE tools through MCP:

| Harness | URL | Notes for RE |
|---|---|---|
| Claude Code | claude.com / docs.anthropic.com | Best skill and MCP support. Opus-class models strong on RE but see §9 for the safety-classifier issue |
| Codex CLI | github.com/openai/codex | Strong agentic coding. GPT models top several RE benchmarks |
| Gemini CLI | github.com/google-gemini/gemini-cli | Good MCP support. Gemini models competitive on cost |
| Cursor | cursor.com | GUI agent. Supports MCP. Used in published case studies |
| Aider | github.com/Aider-AI/aider | Terminal agent. MCP support exists but thinner |
| Goose | github.com/block/goose | Agent framework. MCP support. Used for "ralph loop" workflows |
| OpenClaw | github.com/openclaw/openclaw | General agent harness. Supports MCP |
| Kimi Code | this harness | MCP and skill support. Kimi models have 1M context |

No RE-specific fork of these harnesses was found. The differentiation is in the MCP servers and skills, not in the harness itself.

### 3.3 Dedicated RE harnesses

These projects are built specifically for reverse engineering:

#### REA — Reverse Engineer Anything

- URL: https://github.com/morluto/rea
- Site: https://rea.tools
- Install: `npx rea-agents setup`
- Version observed: rea-agents 6.8.0 (October 2026)
- License: MIT
- TypeScript monorepo. One MCP server plus CLI.
- Covers: native binaries through Ghidra, IDA, Hopper, or Kuna providers. JavaScript and Electron. .NET. APK through JADX. Firmware through Binwalk and Unblob. Pcap. WASM. SQLite. HAR captures. Go and Rust metadata. IL2CPP. Godot. Even RL-environment export.
- Output contract: findings carry evidence and provenance. The design goal is evidence over answers.
- Case studies on the site include a 1996 Win32 game (DX-Ball) reconstructed to byte-match.
- Cautions: star count claims are extraordinary and unverified. Independent evaluations (rea-lab, leanrea) found no significant solve-rate gain over plain agents at about 2x cost. Use REA for targeted questions, not for open-ended exploration.
- Security: REA clones circulate. Install only from the official repository or npm package.

#### Rikugan

- URL: https://github.com/buzzer-re/Rikugan
- Docs: https://rikugan.reversing.codes
- Type: agent embedded inside IDA Pro and Binary Ninja. Not an MCP client.
- Features: own agent loop, 60+ in-process tools, subagent orchestration, plan mode, skills, MCP-server consumption, `/modify` patching, experimental deobfuscation.
- Providers: Claude, MiniMax, Gemini, Kimi, Ollama local models.
- Persists findings to `RIKUGAN.md`.
- Why it matters: the most "agent-native" UX for interactive work. The agent lives where the analysis lives.

#### Kong

- URL: https://github.com/amruth-sn/kong
- PyPI: `kong-re`
- Type: deterministic five-phase pipeline, not an interactive agent.
- Phases: triage, call-graph-ordered LLM analysis, cleanup, synthesis, writeback to the Ghidra database.
- Runs Ghidra in-process through PyGhidra.
- Published result: reconstructed the CVE-2024-3094 XZ backdoor kill chain from the stripped `liblzma` library in about 15 minutes for about $6.63.
- Why it matters: the cleanest documented autonomous pipeline. Good reference for how to structure a batch RE job.

#### ReAgent (Dryxio)

- URL: https://github.com/Dryxio/reagent
- PyPI: `auto-re-agent`
- Type: evidence-driven autonomous RE agent.
- Uses Ghidra plus LLM reconstruction of C/C++ functions, independent checker models, and parity checks.
- Claims application to game decompilation.
- Caution: a different project named `auto-re-agent` on GitHub instructs users to download a zip file. Do not use that one.

#### Open-ReverseLab

- URL: https://github.com/LING71671/open-reverselab
- Type: agent-native RE platform plus knowledge base.
- Features: Ghidra, Frida, x64dbg, Rizin MCP tools. About 180 technique articles. Context-chain documentation (`CLAUDE.md`, `AGENTS.md`, per-board instructions).
- Why it matters: the knowledge-base-as-context pattern is reusable for any serious RE practice.

#### BINNY

- URL: https://github.com/openbin-ai/binny
- Type: model-agnostic RE agent harness.
- Features: triage, investigate, draft loop. Playbooks. Budgets. Checkpoints. Sealed sandbox. Local Ghidra and JADX decompile. STIX 2.1 vocabulary.
- Why it matters: closest to a "PentestGPT for binaries" as a reusable harness.

#### Arkana

- URL: https://github.com/JameZUK/Arkana
- Type: malware-analysis lab behind one prompt.
- Features: about 250 to 289 MCP tools. Angr, YARA, capa, FLOSS, Binary Refinery, Qiling. Multi-format support.
- Why it matters: the most complete single "malware analysis lab" artifact found.

#### Eleven

- URL: https://github.com/Zfinix/eleven
- Type: agent-first RE application with a GUI.
- Features: any ACP-speaking agent drives Ghidra through REA or Rizin, plus JADX for APKs, LLDB debugging, patching with accept/decline cards, per-change authorship log.
- Why it matters: shows the "GUI plus agent" pattern with human approval gates.

#### Others worth knowing

| Project | URL | Note |
|---|---|---|
| reverser_ai | github.com/mrphrazer/reverser_ai | Binary Ninja plugin. Local LLM function naming. Older but still referenced |
| DecompAI | github.com/louisgthier/decompai | Gradio plus LangGraph agent over ELF tools in a Kali container |
| agentic-malware-analysis | github.com/mrphrazer/agentic-malware-analysis | Kali Docker env, 50+ tools, MCP backends, orchestrator skill |
| malhaus | github.com/toorandom/malhaus | Self-hosted static triage platform with MCP server |
| malware_re_agent | github.com/chadcox/malware_re_agent | LangGraph static triage to STIX/ATT&CK output |
| hexgraph | github.com/branover/hexgraph | Sandboxed agentic vulnerability-research workbench |
| reverend | github.com/backbay-labs/reverend | Control plane for agent-assisted reversing over Ghidra |
| reaper | github.com/phulin/reaper | Coding-agent-driven RE workspace |
| OpenBin | openbin.ai | Free browser-based AI decompilation workspace. Cloud service |

### 3.4 The architectural pattern that won

Across all 2026 systems, one pattern repeats:

1. **Deterministic extraction first.** A script or tool extracts facts: strings, imports, call graph, decompiled functions, coverage data.
2. **Agent analysis second.** The LLM reasons over the extracted facts, not over raw bytes.
3. **Verification gate third.** A deterministic check decides: compile the code, run the binary, diff the output, or check the claim against the bytes.
4. **Documented output last.** Findings carry evidence links, not just conclusions.

Systems that skip step 3 fail. Systems that skip step 1 drown in context.

---

## 4. MCP Servers for Binary Analysis Tools

MCP is the standard bridge. This section lists the servers that matter.

### 4.1 IDA Pro

#### Official Hex-Rays IDA MCP

- URL: https://github.com/HexRaysSA/ida-mcp
- Announced: September 2026
- Requires: IDA 9.4 or later with idalib, Python 3.11+
- Install: `uvx ida-hcli mcp install`
- Architecture: "code mode." Only a few tools (`open_database`, `execute_python`, documentation search). The agent writes IDAPython instead of calling 100+ per-operation tools.
- Claimed benefit: about 20 percent fewer tokens than community servers on an internal benchmark.
- Multi-agent: `ida-nexus` lets multiple agents and the GUI share one IDB live.
- Headless: works through idalib workers. No GUI needed for batch work.
- Air-gap: works without network for the analysis itself.
- Model guidance from Hex-Rays: Opus-class via Claude Code, GPT-class via Codex, DeepSeek/Gemini/Kimi/GLM via OpenRouter for open-weight setups. A 27B Qwen model is feasible on a 24GB GPU but "gets stuck and overthinks" per Hex-Rays.
- This is now the recommended IDA MCP. The community server defers to it.

#### mrexodia/ida-pro-mcp

- URL: https://github.com/mrexodia/ida-pro-mcp
- Stars: about 13,400
- History: the community server that started the wave. Now recommends the official Hex-Rays server.
- Features: about 50 tools. Decompile, disassemble, xrefs, patch, types, `py_eval`, debugger tools behind `?ext=dbg`.
- Headless: `idalib-mcp` keeps persistent idalib workers per database.
- Companion dataset: mrexodia/mcp-reversing-dataset (RE task prompts plus traces).
- Use case: still useful where the official server does not fit, or for the debugger extension.

#### Other IDA MCP servers

| Server | URL | Note |
|---|---|---|
| blacktop/ida-mcp-rs | github.com/blacktop/ida-mcp-rs | Rust headless IDA MCP. Lean profile cuts tokens 25 percent. Tracks IDA 9.5 |
| MeroZemory/ida-multi-mcp | github.com/MeroZemory/ida-multi-mcp | Multi-instance IDA MCP. BCSD function-similarity search across binaries |
| jtsylve/re-mcp | github.com/jtsylve/re-mcp | Unified IDA plus Ghidra MCP with shared tool names |
| 0xshlomil/ida-free-mcp | github.com/0xshlomil/ida-free-mcp | MCP for IDA Free through a C++ plugin. HTTP transport |
| P4nda0s/IDA-NO-MCP | github.com/P4nda0s/IDA-NO-MCP | Exports IDA decompilation to plain files for AI IDEs. Anti-MCP approach |
| trailofbits/idac | github.com/trailofbits/idac | IDA CLI for agents. Nexus-based. JSON output. Alpha |

### 4.2 Ghidra

The Ghidra MCP space is crowded. These are the ones that matter:

#### LaurieWired/GhidraMCP

- URL: https://github.com/LaurieWired/GhidraMCP
- Stars: about 11,800
- License: Apache-2.0
- The original and most-starred Ghidra MCP.
- Requires Ghidra 12.1.4.
- Install: `uvx --from git+https://github.com/LaurieWired/GhidraMCP ghidra-mcp`
- Features: decompile, rename, list methods, imports, exports.
- v2.0 (October 2026) added headless PyGhidra mode: `ghidra-mcp --headless --binary ...` needs no GUI.
- Transports: stdio, streamable HTTP.
- Security issues documented: unauthenticated HTTP server, prompt injection through decompiled output, persistent stored injection through comment write-back. See section 11.

#### bethington/ghidra-mcp

- URL: https://github.com/bethington/ghidra-mcp
- Stars: about 6,100
- Features: 219 MCP tools, the most complete Ghidra bridge.
- Modes: GUI plugin plus headless server.
- Extras: lazy tool loading, batch operations, P-code emulation, live debugger integration, PCode-graph dataflow, Ghidra Server integration, Docker deployment.
- Requires Ghidra 12.1.4 and Java 21.
- Install: `uv tool install` of the release wheel after installing the Ghidra extension zip.
- Very actively developed (v7.x in 2026).
- Caveat: the lineage between this and LaurieWired's project is unclear. Both are maintained. Pick one and verify Ghidra 12.2 compatibility.

#### cyberkaida/reverse-engineering-assistant (ReVa)

- URL: https://github.com/cyberkaida/reverse-engineering-assistant
- Stars: about 940
- Design: deliberately small tools to fight context rot and hallucination.
- Features: Ghidra extension, assistant mode on port 8080, headless mode for CI, bundled skills (`binary-triage`, `deep-analysis`, `crypto`, `ctf-rev`, `ctf-pwn`, `ctf-crypto`).
- PyPI: `reverse-engineering-assistant`
- Why it matters: the anti-hallucination design is the most thoughtful in the Ghidra space.

#### Other Ghidra MCP servers

| Server | URL | Note |
|---|---|---|
| clearbluejar/pyghidra-mcp | github.com/clearbluejar/pyghidra-mcp | Headless PyGhidra MCP. ChromaDB semantic search over decompiled code. GHCR image |
| symgraph/GhidrAssistMCP | github.com/symgraph/GhidrAssistMCP | 100 tools. Native Java MCP. Headless `analyzeHeadless` mode. Agent_lab sandbox profile |
| symgraph/GhidrAssist | github.com/symgraph/GhidrAssist | LLM assistant inside Ghidra. MCP client. Any OpenAI-compatible endpoint including Ollama |
| mrphrazer/ghidra-headless-mcp | github.com/mrphrazer/ghidra-headless-mcp | 212 tools. Headless only. Read-only default. `ghidra.eval` escape hatch is dangerous on untrusted binaries |
| elliottophellia/Ryuumonbuchi | github.com/elliottophellia/Ryuumonbuchi | 217 tools. Persistent JVM worker child avoids per-call startup |
| cellebrite-labs/ghidra-rpc | github.com/cellebrite-labs/ghidra-rpc | Ghidra as daemon. JSON CLI. Agent-agnostic. Decompile, xrefs, rename, retype, patch, BSim diff |
| jumpeip/ghidrallm-mcp | github.com/jumpeip/ghidrallm-mcp | In-Ghidra HTTP MCP. 70 tools including `emulate` for pcode-level execution |
| akiselev/ghidra-cli | github.com/akiselev/ghidra-cli | Rust CLI driving a persistent Ghidra bridge. JSON output. Sub-second queries |
| llnl/OGhidra | github.com/llnl/OGhidra | LLNL's Ollama plus Ghidra bridge. Local models. RAG over functions |

### 4.3 Binary Ninja

#### Native MCP server (Binary Ninja 6.0)

- Docs: https://docs.binary.ninja/guide/mcp.html
- Released: September 2026 with Binary Ninja 6.0 "Krypton"
- Two variants: GUI server inside the app over HTTP (all editions including free, default `http://127.0.0.1:24642/mcp` with bearer token) and headless `binaryninja_mcp` over stdio (Commercial/Ultimate, macOS/Linux only).
- Tools: disassembly, Pseudo C (HLIL), MLIL, LLIL, function metadata, types, memory reads.
- This ended the third-party plugin era for Binary Ninja.

#### Sidekick

- URL: https://sidekick.binary.ninja
- Docs: https://docs.sidekick.binary.ninja
- Type: commercial AI agent layer inside Binary Ninja.
- Features: multi-agent pipeline with a validation agent, semantic search over stripped binaries, automatic type/name/structure recovery with self-repair, analysis notebook with evidence links, transaction log where every agent edit is revertable, Python API for headless pipelines, managed cloud or on-prem deploy, BYO model endpoints including Ollama and vLLM.
- Headless: yes, through `sidekick.api`.
- This is the most productized LLM-in-the-loop RE harness.

#### Community Binary Ninja MCP servers

| Server | URL | Note |
|---|---|---|
| fosdickio/binary_ninja_mcp | github.com/fosdickio/binary_ninja_mcp | BN plugin plus HTTP endpoints. About 50 tools. Largely superseded by native 6.0 MCP |
| mrphrazer/binary-ninja-headless-mcp | github.com/mrphrazer/binary-ninja-headless-mcp | 181 tools. Headless. Read-only default. Undo/redo transactions. CI-tested |
| banteg/bn | github.com/banteg/bn | CLI socket bridge into the open GUI. Works with personal license. Installs a Codex skill |
| symgraph/BinAssistMCP | github.com/symgraph/BinAssistMCP | Planned archival in favor of the native server |

### 4.4 radare2 / rizin / Cutter

| Server | URL | Note |
|---|---|---|
| radareorg/radare2-mcp (r2mcp) | github.com/radareorg/radare2-mcp | Official r2 MCP in C. Stdio, r2 core plugin HTTP, r2pipe attach. Session multiplexing. Readonly/sandbox modes |
| radareorg/r2ai | github.com/radareorg/r2ai | r2 plugin for LLM prompts. ReAct mode. Local and remote models. RAG vector DB |
| radareorg/radare2-skills | github.com/radareorg/radare2-skills | Official skill collection for r2 |
| drvcvt/radare2-mcp | github.com/drvcvt/radare2-mcp | TypeScript. 85 tools over radare2/Rizin |

Cutter has no mature AI integration. The only Cutter-native AI plugin found (gavrh/stutter) is a one-author hobby project. r2ai and r2mcp work on the rizin/radare2 core that Cutter embeds.

### 4.5 Debuggers

| Server | URL | Note |
|---|---|---|
| duty1g/x64dbg-mcp-server | github.com/duty1g/x64dbg-mcp-server | Native Zig x64dbg plugin over HTTP. About 2,800 stars. The most-starred debugger MCP |
| AgentSmithers/x64DbgMCPServer | github.com/AgentSmithers/x64DbgMCPServer | C# MCP for x64dbg |
| SetsunaYukiOvO/x64dbg-mcp | github.com/SetsunaYukiOvO/x64dbg-mcp | JSON-RPC over HTTP/SSE |
| mnemonic-re/WinDbgX-MCP | github.com/mnemonic-re/WinDbgX-MCP | MCP for WinDbg/WinDbgX. KDNET kernel debugging. Pre-1.0. Prompt-injection hardened |
| FuzzySecurity/kahlo-mcp | github.com/FuzzySecurity/kahlo-mcp | Frida session lifecycle MCP. Versioned module store |
| dnakov/frida-mcp | github.com/dnakov/frida-mcp | Original stdio Frida MCP. About 460 stars |
| s4dp4nd4/frida-c2-mcp | github.com/s4dp4nd4/frida-c2-mcp | On-device Frida MCP for Android and iOS. HTTP transport |

### 4.6 angr

angr 10.x ships its own MCP server. This is the only symbolic-execution engine with a first-party agent interface.

- Install: `pip install "angr[llm]"` (the extra pulls pydantic-ai, mcp, fastmcp)
- Run: `angr-mcp` console script or `python -m angr.mcp --transport stdio|sse|http`
- Tools: `load_binary`, `get_cfg`, `list_functions`, `get_basic_blocks`, `get_function`, `close_project`
- angr-management plugin: github.com/sandbornm/angr_mcp binds MCP tools to the live GUI session with symbolic-execution tools.

### 4.7 Multi-tool suites

| Server | URL | Note |
|---|---|---|
| sjkim1127/Reversecore_MCP | github.com/sjkim1127/Reversecore_MCP | 179 tools wrapping radare2, r2ghidra, LIEF, Capstone, YARA, angr, DIE, capa, FLOSS, binwalk, Volatility3, Scapy |
| vmoranv/jshookmcp | github.com/vmoranv/jshookmcp | 735 tools across 36 domains. JS/web reversing focus. Profile ladder to manage context cost |
| Ashibalt/minusOne-mcp-reverse | github.com/Ashibalt/minusOne-mcp-reverse | 77 semantic ops. Dockerized static backends with `--network none`. Owner-armed dynamic plane. The most security-engineered design found |
| kadohack12/dogbolt-mcp | github.com/kadohack12/dogbolt-mcp | MCP over dogbolt.org's public decompiler fleet. Privacy caveat: uploads are public |

---

## 5. Agent Skills for RE

### 5.1 The Agent Skills format

The skill format is an open standard at https://github.com/agentskills/agentskills. Anthropic open-sourced it. It is supported by Claude Code, Codex, Cursor, Copilot, Gemini, Windsurf, Kimi Code, and others.

A skill is a directory with a `SKILL.md` file plus optional `scripts/`, `references/`, and `assets/` subdirectories.

Frontmatter fields:

| Field | Rule |
|---|---|
| `name` | Lowercase-hyphen, max 64 characters, must match directory name |
| `description` | Max 1024 characters. Must state what the skill does and when to use it |
| `license` | Optional |
| `compatibility` | Max 500 characters. For example "Requires Ghidra 12 + Java 21" |
| `metadata` | Optional key-value pairs |
| `allowed-tools` | Experimental |

Progressive disclosure: name and description are always loaded (about 100 tokens per skill). The SKILL.md body loads on activation (keep under 500 lines or 5,000 tokens). Resource files load on demand.

Validator: `skills-ref validate ./my-skill` from the agentskills repository.

Install path: `npx skills add <repo>` (Vercel's skills CLI, skills.sh). The registry tracks install counts and security audits.

### 5.2 How to write an RE skill

The best RE skills follow this pattern:

1. **Routing table.** Map target type to first tool. Example: "APK → jadx-mcp. PE → ida-mcp. Firmware → binwalk then Ghidra."
2. **Explicit non-goals.** State what the skill does not do. Example: "Do not use this skill for source-code review."
3. **Evidence contract.** Require findings to cite file offsets, addresses, or tool outputs.
4. **Connection recovery.** Tell the agent what to do when the MCP server is down.
5. **References on demand.** Put long procedures in `references/*.md` files, not in the SKILL.md body.
6. **Verification steps.** End every workflow with a deterministic check.

### 5.3 RE skill repositories

#### Large collections

| Repo | URL | Content |
|---|---|---|
| zhaoxuya520/reverse-skill | github.com/zhaoxuya520/reverse-skill | About 45 modules. Router with 44 rules. APK, iOS, IDA, radare2, Binary Ninja, .NET, JS, DSL VMs, malware, CTF, firmware. 175-case regression benchmark |
| dslsdzc/rev-skills | github.com/dslsdzc/rev-skills | 122 skills. Chinese-first. Entry `re-analyze` to gateway `re-binary-core` to atomic per-tool skills |
| manyuegong33/r0crawl_skills | github.com/manyuegong33/r0crawl_skills | 196 modules. Codex-oriented. Bundled runnable helpers |
| batteryshark/rekit | github.com/batteryshark/rekit | Harness-agnostic catalog. About 20 skills. Registry.json manifests. MCP server mode |
| mukul975/Anthropic-Cybersecurity-Skills | github.com/mukul975/Anthropic-Cybersecurity-Skills | 818 cybersecurity skills. Many malware-analysis skills. Mapped to ATT&CK and NIST |
| ljagiello/ctf-skills | github.com/ljagiello/ctf-skills | CTF suite. `ctf-reverse` has 22 files covering VMs, WASM, Go/Rust/Android reversing |
| wshobson/agents | github.com/wshobson/agents | Large cross-harness marketplace. `protocol-reverse-engineering` and `anti-reversing-techniques` skills have high install counts |

#### Ghidra-specific skills

| Repo | URL | Content |
|---|---|---|
| cyberkaida/reverse-engineering-assistant | github.com/cyberkaida/reverse-engineering-assistant | ReVa skills: binary-triage, deep-analysis, pyghidra-scripting, ctf-rev, ctf-pwn, ctf-crypto |
| 0xeb/ghidrasql-skills | github.com/0xeb/ghidrasql-skills | Skills for ghidrasql live SQL interface to Ghidra |
| Cristallin2006/ghidra-skill-for-dsh | github.com/Cristallin2006/ghidra-skill-for-dsh | Headless Ghidra daemon plus skill family. Circuit breakers against agent failure loops |
| akiselev/ghidra-cli | github.com/akiselev/ghidra-cli | Ships `docs/skills/ghidra-cli/SKILL.md`. Example of pairing a CLI with a first-party skill |
| ByteLandTechnology/headless-ghidra | github.com/ByteLandTechnology/headless-ghidra | 8-skill phased workflow: P0 intake, P1 baseline, P2 evidence, P3 discovery, P4 batch decompile |

#### IDA-specific skills

| Repo | URL | Content |
|---|---|---|
| Newmcpe/ida-reverse-engineering-skill | github.com/Newmcpe/ida-reverse-engineering-skill | Skill driving IDA through MCP. Rename, retype, struct recovery |
| haikow/claude-reverse-skills | github.com/haikow/claude-reverse-skills | 5 skills: ida-reverse, apk-reverse, radare2, reverse-engineering, mcp-js-reverse-playbook |
| P4nda0s/reverse-skills | github.com/P4nda0s/reverse-skills | rev-idapython, rev-ios-dump, rev-u3d-dump, rev-frida, rev-unicorn-debug |
| dariushoule/x64dbg-skills | github.com/dariushoule/x64dbg-skills | Claude Code plugin for x64dbg automation |

#### Domain-specific skills

| Repo | URL | Content |
|---|---|---|
| SimoneAvogadro/android-reverse-engineering-skill | github.com/SimoneAvogadro/android-reverse-engineering-skill | APK decompile workflow. R8 Kotlin-name recovery. API extraction |
| index-login/MobileRE-Skill | github.com/index-login/MobileRE-Skill | Mobile RE skill system. 25 Frida modules. Unpacking pipeline. Dex-to-C handoff |
| Fausto-404/ai-mobile-reverse-skills | github.com/Fausto-404/ai-mobile-reverse-skills | 6-phase mobile pentest pipeline. Machine-readable phase contracts. Guardian grading |
| incogbyte/iOS-reverse-engineering-claude-skill | github.com/incogbyte/iOS-reverse-engineering-claude-skill | iOS IPA/Mach-O skill. Ipsw class-dump. 14-category static audit |
| mrphrazer/agentic-malware-analysis | github.com/mrphrazer/agentic-malware-analysis | Malware triage orchestrator skill. Case-directory artifact contract |
| gl0bal01/malware-analysis-claude-skills | github.com/gl0bal01/malware-analysis-claude-skills | 5 skills: triage, dynamic analysis, detection engineering, reporting, file analyzer |
| schlarpc/re-shell | github.com/schlarpc/re-shell | Nix dev-shell packaging the RE toolchain plus per-filetype skills |
| morluto/rea | github.com/morluto/rea | The `reverse-engineer-anything` skill. Routing table. Evidence contract. 8 reference files |

### 5.4 Prompt libraries and methodology repos

- **unknowbug/RE-Framework** — methodology framework splitting domain-agnostic core skills from target modules.
- **2233admin/reverse-skill-evolver** — skill routing plus MCP integration plus agent swarms with explicit call budgets.
- **ReVa skills** — the closest thing to a reference-quality prompt library for Ghidra. Each SKILL.md encodes tool-choice heuristics and explicit "do not use when" boundaries.
- **aiengineeringfromscratch.com lesson 45** — practitioner index with MCP comparison, benchmark numbers, and a six-field scorecard methodology.
- **Clearseclabs "Building Agentic RE"** — taxonomy of four maturity stages: copy/paste, MCP, agentic, coding agents.

---

## 6. Models for RE Work

### 6.1 Benchmark evidence

The following benchmarks measured models on RE tasks in 2025-2026:

#### Retrobench

- URL: https://retrobench.ai
- Task: agents get raw MIPS assembly of N64-era game functions and must write C that recompiles byte-for-byte with the original IDO compiler.
- Budget: 25 builds per function.
- Top scores (v0.4.x): Claude Opus 5.5 about 98.4 mean byte-match. GPT-6.1 Sol 94.9. GPT-6 Astra 94.3. Gemini 4 Argon about 84.8. Claude Sonnet 5.5 84.2. GLM-5.3 80.2. Kimi K3 79.5. DeepSeek-V4.1-Flash about 75.
- Caveats: one architecture (MIPS/IDO), five targets, run-to-run variance in low double digits.
- Why it matters: the only public board where the task is genuinely "RE assembly, verify against binary."

#### DecBench

- URL: https://decbench.com
- Repo: github.com/noelo-lab/decbench
- Dataset: huggingface.co/datasets/noelo-lab/decbench-dataset
- Task: ranks decompilers and LLM agents on three metrics: CFG graph-edit distance, type correctness against DWARF ground truth, recompilation byte-match.
- Sample-set agent results: Codex/gpt-6-astra 59.6 percent union perfect-score. Psalms (closed) 57.6. Claude Code (claude-opus-4-8) 56.8.
- Traditional decompilers cap at Kuna 35.2, Ghidra 26.4, IDA 30.8.
- Cost data: about $1.0-1.2 per function for gpt-6-astra agent runs. About $6.6 for claude-opus-4-8.
- Since July 2026 it runs Codex and Claude Code as competitors directly.

#### BinaryAudit (QuesmaOrg)

- URL: https://quesma.com/benchmarks/binaryaudit
- Repo: github.com/QuesmaOrg/BinaryAudit
- Task: 33 tasks. Hidden backdoors in about 40MB real binaries. Ghidra and Radare2 available.
- Results: claude-opus-4.6 49 percent. Gemini-3.1-pro-preview 49 percent. Gpt-5.2-codex-xhigh 46 percent. Gemini-3-pro-preview 44 percent. Gemini-3-flash-preview 37 percent. Claude-sonnet-4.5 26 percent. Deepseek-v3.2 12 percent. Grok-4.1-fast 7 percent.
- Cost: gemini-3-flash did 37 percent for $18 total. Gemini-3.1-pro did 49 percent for $41.

#### SRE-Bench

- URL: https://daplab.cs.columbia.edu/benchmarks/sre-bench
- arXiv: https://arxiv.org/abs/2608.11469
- Task: 19 private real-world programs (average 16.9K lines of code), 262 binary instances, 44 anti-analysis mechanisms, 1,572 graded tasks.
- Results: GPT-5.6-Sol solved 31.5 percent fully. Claude-Fable-5.1 26.9 percent. Unconstrained GPT-6-Astra reached about 82 percent solved.
- Cost per instance: GPT-6-Astra $13.5. GPT-5.6 Sol $42.5. Claude Fable 5.1 $34.7. Claude Opus 5 $23.6. DeepSeek-V4.1-Flash $0.50 but only 0.8 percent solved.
- The unconstrained evaluation consumed about $566,000 in tokens.
- Why it matters: the most rigorous RE benchmark. It shows budget and safeguards dominate scores.

#### AgentRE-Bench

- URL: https://www.agentre-bench.ai
- Repo: github.com/agentrebench/AgentRE-Bench
- Task: 33 challenges. 13 Linux ELF plus 10 Windows PE programs (each PE scored stripped and unstripped). Fixed 25-call tool budget.
- Results (v3.1, Windows PE): Muse Wonder 87.4. GPT-6 Astra 87.0. Grok 4.7 79.6. DeepSeek V4.1 Flash 78.3. Claude Opus 5.5 69.7. Gemini 4 Argon 31.2. No attempt got full credit.

#### CrackMeBench

- arXiv: https://arxiv.org/abs/2605.10597
- Task: 8 public calibration plus 12 generated crackme tasks. Deterministic oracles. No-network Docker sandbox.
- Results: pass@3 on generated split: GPT-5.5 92 percent. Claude Opus 4.7 58 percent. Kimi K2 42 percent.
- Public calibration was much harder: 3/8, 2/8, 1/8. Public crackmes are memorized.

#### MalwareBench

- URL: https://malwarebench.com
- Task: 12 cases of real obfuscated malware across PE, ELF, Mach-O, APK. Behavioral analysis plus reusable extractor.
- Results: best@3 in low single digits. Best model (GPT-6.1 Sol) scored 7.6 percent. Models refused about 26 percent of rollouts.
- Dominant failure: "dependency binding not found" in 47.5 percent of runs.

#### Other benchmarks

| Benchmark | URL | What it measures |
|---|---|---|
| Decompile-Bench | arxiv.org/abs/2505.12668 | 2M binary-source pairs. Re-executability. Leakage-controlled eval split |
| DecompileBench | arxiv.org/abs/2505.11340 | 23,400 functions. LLM-as-judge for analyst usability |
| BinMetric | arxiv.org/abs/2505.07360 | 1,000 questions over 20 projects. 6 binary-analysis tasks |
| REBench | arxiv.org/abs/2604.27319 | Function-name and type recovery on stripped binaries |
| REFORGE | arxiv.org/abs/2607.07738 | Decompiled function naming benchmark |
| CREBench | arxiv.org/abs/2604.03750 | Crypto-binary RE. 432 challenges. Humans still dominate |
| ICall-Bench | arxiv.org/abs/2610.37871 | Interprocedural reasoning. Indirect-call target recovery |
| Reveree | arxiv.org/abs/2609.01185 | Diagnostic framework for RE agent trajectories |
| ExeBench-FHD | arxiv.org/abs/2610.28212 | Audit of ExeBench. Found 9 fidelity issues |
| NYU CTF Bench | nyu-llm-ctf.github.io | 200 CSAW CTF challenges. Contaminated by memorization |
| InterCode-CTF | intercode-benchmark.github.io | Terminal-interaction CTF. Saturated at 95 percent |
| Cybench | cybench.github.io | 40 professional-level CTF tasks |
| BIOPSY-Bench | github.com/CLAY-JYB/BIOPSY-Bench | 25 hardened binaries. Pass rates 0.01-0.035 |
| HWREBench | hwrebench.com | Hardware and firmware RE agent eval |

### 6.2 Model tiers for RE

#### Tier 1: frontier agentic models

| Model | Access | RE evidence | Notes |
|---|---|---|---|
| GPT-6 Astra / GPT-6.1 Sol | Codex CLI, API | Top-3 on Retrobench. Top on DecBench sample set | Best verified all-round agentic RE per dollar |
| Claude Opus 4.8 / Sonnet 5.5 | Claude Code, API | Top raw capability on several boards | Opus 5.5 safety classifier halts RE requests since about October 21, 2026. Use 4.8 |
| Gemini 4 Argon / 3.8 Flash | Gemini CLI, Antigravity | Strong agentic scores. Good cost | Watch provider content-filter stops |
| Claude Fable 5.1 | Claude Code | SRE-Bench 26.9 percent full solve | High cost per instance |

#### Tier 2: open-weight models with 1M context

| Model | Context | RE evidence | Notes |
|---|---|---|---|
| Kimi K3 / K3.1 Pro | 1M | Retrobench 79.5. No refusal classifier | Best open option for whole-Ghidra-export context |
| DeepSeek V4 Pro / V4.1 Flash | 1M | Retrobench about 75. Cheapest capable agent loops | V4.1 Flash at $0.08/task on HWREBench |
| GLM-5.3 / GLM-5.3 Flash | 1M | Retrobench 80.2 / 66.7 | Strong value. No classifier |
| MiMo V2.6 Pro | large | Retrobench 72.1 | Surprising performer |
| Qwen3-Coder (30B-A3B / Next) | 262K | Backbone of AutoDecompiler-30B | Best local/private option |

#### Tier 3: specialized decompilation models

| Model | URL | What it does |
|---|---|---|
| LLM4Decompile v1.6 / v2 / SK2Decompile | github.com/albertan017/LLM4Decompile, HF LLM4Binary | Assembly-to-C and Ghidra-pseudo-code refinement. 1.3B to 33B |
| CodeInverter (CIM) | github.com/LiuPeiP-CS/CodeInverter | CFG and data-mapping augmented decompilation. 1.3B/6.7B |
| Nova | github.com/lt-asset/nova | Assembly-pretrained code LLM. ICLR 2025 |
| ReCopilot | github.com/XingTuLab/recopilot | 7B binary-analysis LLM. Name/type/struct recovery. Hosted model |
| AutoDecompiler | arxiv.org/abs/2606.16162 | RL multi-turn decompilation. Compile/execute feedback |
| Ventris | reveng.ai (closed) | Commercial neural decompiler. DecBench 32.8 percent |
| Kuna | github.com/Noelo-Lab/kuna | Agent-first Rust decompiler. DecBench structuring leader |
| PyBytecode-v3 | huggingface.co/BlazingCustoms | Python bytecode to source |

### 6.3 Practical model guidance

- For interactive RE sessions: use a frontier model through Claude Code or Codex CLI.
- For batch function-level decompilation: use a specialist model (LLM4Decompile, CodeInverter) locally, then feed the output to a frontier model for reasoning.
- For private or sensitive binaries: use a 1M-context open model (Kimi K3, DeepSeek V4, GLM-5.3) through an MCP harness.
- For air-gapped work: Qwen3-Coder-Next on a local GPU is the standard choice. Expect weaker results on obfuscated code.
- Avoid Claude Opus 5.5 for RE tasks until the safety-classifier issue resolves. Use Opus 4.8 or a non-Anthropic model.

---

## 7. Core RE Techniques with AI

### 7.1 Decompilation

#### Classical decompilers (2026 state)

| Tool | Version | Status | Agent interface |
|---|---|---|---|
| IDA Pro | 9.5 (October 2026) | Current | Official MCP. Assist AI harness. Headless for agent fleets |
| IDA Home | 9.5 | Current | Includes 11 cloud decompilers. 70+ disassemblers |
| Binary Ninja | 6.0 Krypton (September 2026) | Current | Native MCP in all editions. Sidekick AI layer |
| Ghidra | 12.2 (October 2026) | Current | Multiple MCP servers. PyGhidra headless |
| JEB Pro | 5.48 (October 2026) | Current | MCP server. VIBRE AI assistant |
| radare2 | 6.2.4 | Active | r2mcp, r2ai |
| rizin / Cutter | 0.9.1 / 2.5.0 | Active | r2mcp works on the core. Cutter has no AI integration |
| angr | 10.0.5 | Active | Built-in MCP. Python API |
| Miasm | main branch | Active | Python API. No MCP |
| RetDec | v5.0 (2022) | Effectively dead | None. Do not build new workflows |
| Snowman | archived | Dead | None |
| Reko | 0.12.x | Maintained | CLI and web UI. Niche |

#### Decompiler quality notes

- IDA 9.5 added three decompilers (Android Dalvik, Infineon TriCore, Qualcomm Hexagon), bitfield recovery, AVX/SSE-to-C lifting, recursive decompilation, FLIRT 2.0, and Apple kernelcache analysis.
- Binary Ninja 6.0 refactored calling conventions, added HLIL structure initializers, type fragments, and about 2x analysis speed.
- Ghidra 12.2 added timeless debugging (beta), structure/union/enum merger, Hexagon and CIP-51 processors, and TLS enforcement.
- Ghidra's Rust demangling is built in since version 11. The old GhidRust plugin is obsolete.

#### Neural decompilation

The 2025-2026 research line converged on one pattern: **LLM refines decompiler output, not raw assembly.**

Key systems:

| System | URL | Technique | Result |
|---|---|---|---|
| LLM4Decompile v2 / SK2Decompile | github.com/albertan017/LLM4Decompile | Two-phase: structure recovery then identifier naming | 64.9 percent re-executability at 9B. Open weights |
| CodeInverter (CIM) | github.com/LiuPeiP-CS/CodeInverter | CFG and data-flow context in prompt | 62 percent re-exec vs 30.9 for baseline |
| Decaf | github.com/AlexShypula/decaf | Sample N candidates, recompile, rank by byte distance | 83.9 percent on ExeBench Real -O2 |
| HELIOS | arxiv.org/abs/2601.14598 | Zero-shot prompting with CFG summary plus compiler feedback | Compilability 45 to 85 percent |
| CHISEL | arxiv.org/abs/2608.27981 | Test-suite-free iterative recovery with fuzzing feedback | 96.1 percent re-compilability |
| IDIOMS | NDSS 2026 | Joint code plus type-definition prediction | 54.4 percent on ExeBench |
| FidelityGPT | NDSS 2026 | Post-processes decompiler output. Labels distortion types | RAG-flavored line-level fixer |
| ALT4Decompile | arxiv.org/abs/2509.14646 | Rewrites assembly into C-aligned loop tree | 70.4 percent pass under obfuscation |
| ReSource | arXiv 2608.27889 | Three-tier recovery under optimization and obfuscation | 83 percent top-5 retrieval |
| ASAP | arXiv 2610.06900 | Assembly-source aligned pseudocode refinement | Re-exec 64.7 to 71.9 percent |

#### Practical decompilation workflow

1. Run the classical decompiler first (IDA, Ghidra, Binary Ninja).
2. Feed the pseudocode to the LLM, not the raw assembly.
3. Ask for bounded tasks: rename this function, explain this loop, recover this type.
4. Verify: compile the candidate, run it, compare behavior.
5. For bulk work, use a specialist model (LLM4Decompile, CodeInverter) locally.

### 7.2 Function and variable naming

Naming is where AI helps most consistently.

| Tool | URL | Technique |
|---|---|---|
| ReCopilot | github.com/XingTuLab/recopilot | QI-ANXIN's IDA plugin. Function names, variable names, type recovery, struct definitions, doc generation, homology search |
| GenNm | NDSS 2025 | Generative-model variable naming |
| SymGen | NDSS 2025 | LoRA-fine-tuned Code Llama generates function names |
| ReSym | ACM 2024 | Two fine-tuned LMs plus Prolog cross-function reasoning |
| DIRTY/VarBERT | USENIX Sec 2022 / TSE 2024 | Transformer variable-name and type recommendation |
| Kong | github.com/amruth-sn/kong | Call-graph-ordered LLM naming through Ghidra |
| ReverserAI | github.com/mrphrazer/reverser_ai | Local LLM function naming in Binary Ninja |
| Gepetto | github.com/JusticeRage/Gepetto | IDA pseudocode to LLM explain/comment/rename |
| GhidraGPT | github.com/weirdmachine64/GhidraGPT | In-Ghidra LLM actions |
| DAILA | mahaloz.re | Decompiler-independent assistant across IDA/Ghidra/BN/angr |

Measured results: LLM rename accuracy was 85 percent vs human 66 percent on known algorithms, but only 57 percent vs 65 percent overall (NDSS 2026 study). Names are plausible, not verified. Always check.

### 7.3 Dynamic analysis

| Tool | URL | What it instruments | AI integration |
|---|---|---|---|
| Frida | github.com/frida/frida | JS-scripted instrumentation on all major OSes | Many frida-mcp servers. Kahlo-mcp is the most serious |
| DynamoRIO | github.com/DynamoRIO/dynamorio | C++ DBI platform. Instruction-level IR | Powers Sydr. Not LLM-native |
| Intel PIN | intel.com | x86/x64 DBI. Pintool C++ API | No active LLM ecosystem |
| QBDI | github.com/QBDI/QBDI | LLVM-based DBI. Python and Frida bindings | Agent-scriptable |
| Unicorn | github.com/unicorn-engine/unicorn | Multi-arch CPU emulator | Python bindings. AFL++ unicorn mode |
| Qiling | github.com/qilingframework/qiling | Full user-mode OS emulation | Python framework. GDB stub |
| angr | github.com/angr/angr | Symbolic and concrete execution | Built-in MCP |
| Triton | github.com/JonathanSalwan/Triton | Concolic execution. Taint. SMT | Backend for deobfuscation tools |
| TritonDSE | github.com/quarkslab/tritondse | Coverage-guided DSE | Research-grade |
| KLEE | github.com/klee/klee | LLVM-bitcode symbolic VM | Source/IR level only |
| Manticore | github.com/trailofbits/manticore | Symbolic execution | Archived. Do not use for new work |
| SymCC | github.com/eurecom-s3/symcc | Compiler-based concolic execution | Best-effort maintenance |
| Sydr | github.com/sydr-fuzz | DynamoRIO-based DSE branch inverter | Powers OSS-Sydr-Fuzz |

### 7.4 Symbolic execution and SMT

| Tool | URL | Role in AI RE |
|---|---|---|
| angr 10.x | github.com/angr/angr | CFG recovery, symbolic execution, decompilation. Rust core. Built-in MCP |
| claripy | inside angr 10.x | Constraint AST layer. Rewritten in Rust. Standalone repo archived January 2027 |
| Triton | github.com/JonathanSalwan/Triton | Concolic execution for obfuscated binaries. Z3 and Bitwuzla backends |
| KLEE | github.com/klee/klee | LLVM-bitcode symbolic VM. POSIX emulation |
| Z3 | github.com/Z3Prover/z3 | SMT solver. Angr pins z3-solver 5.3.3.0 |
| Bitwuzla | github.com/bitwuzla/bitwuzla | Faster than Z3 on bitvector-heavy queries. Triton backend |
| Miasm | github.com/cea-sec/miasm | Python RE framework. Own IR. Symbolic execution. Z3 extra |

LLM-guided symbolic execution papers (2026):

| Paper | arXiv | Technique |
|---|---|---|
| Agolic | 2608.06397 | LLM agent plans bounded symbolic-execution runs |
| KLEECopilot | 2607.21676 | LLM marks vulnerable code and loop exits for KLEE. +42 percent block coverage |
| RECON | 2606.10264 | LLM extracts readable constraints from bytecode. 5.8x faster than SE |
| POVGEN | 2608.04217 | LLM-guided constraint reasoning for proof-of-vulnerability |
| SymTEE | FORGE 2026 | LLM-assisted SE for TEE input validation |
| Ghost code | PACMSE 2026 | LLM generates lightweight stubs for SE to invert difficult fragments |

### 7.5 Deobfuscation

#### VMProtect and Themida

| Tool | URL | Technique | Status |
|---|---|---|---|
| wul7chaos/vmp-reverse-skill | github.com/wul7chaos/vmp-reverse-skill | ptrace trace capture, handler slicing, Ghidra P-code IR, LLM claims verified by Z3 | Active. Research-grade. Linux x86-64/ARM64 |
| PUSHAN | arxiv.org/abs/2603.18355 | Trace-free VPC-sensitive symbolic emulation. VMP/Themida/Tigress | Paper. No official artifact |
| NoAddr/yaps | github.com/NoAddr/yaps | Open PUSHAN-style rebuild. SLEIGH p-code | Active. AI-generated code. Windows-only |
| NaC-L/Mergen | github.com/NaC-L/Mergen | Assembly to LLVM IR lifter. Symbolic execution through VMProtect/Themida | Active. Handles VMP 3.4-3.8.1 and Themida |
| JonathanSalwan/VMProtect-devirtualization | github.com/JonathanSalwan/VMProtect-devirtualization | Triton-based symbolic execution plus LLVM lifting | Stale but canonical |
| can1357/NoVmp | github.com/can1357/NoVmp | VTIL-based static devirtualizer | Stale |
| aftermathlabs/vmp2 | github.com/aftermathlabs/vmp2 | VMProtect 2 tooling | Legacy. Author recommends newer approaches |
| jz0/tvm-devirt | github.com/jz0/tvm-devirt | Rust devirtualizer for Tencent VM | Active |
| bobalkkagi/bobalkkagi | github.com/bobalkkagi/bobalkkagi | Themida 3.x unpacking | Stale-ish. Devirt WIP |
| chramiq/de4vmp | github.com/chramiq/de4vmp | .NET VMProtect devirtualizer | Maintained-ish |
| Aetherx86/VMP_DEVIRT | github.com/Aetherx86/VMP_DEVIRT | AETHER-64 plus CIA plus MBA suite | New 2026. Self-reported benchmarks |

#### OLLVM and control-flow flattening

| Tool | URL | Note |
|---|---|---|
| cdong1012/ollvm-unflattener | github.com/cdong1012/ollvm-unflattener | OLLVM CFF deobfuscation |
| obpo-project/obpo-plugin | github.com/obpo-project/obpo-plugin | OLLVM-CFF IDA plugin |
| cq674350529/deflat | github.com/cq674350529/deflat | angr-based OLLVM deobfuscation |
| 453483289/OLLVM_Deobfuscation | github.com/453483289/OLLVM_Deobfuscation | x86 Linux OLLVM |

#### JavaScript deobfuscation

| Tool | URL | Note |
|---|---|---|
| XingTuLab/JSIMPLIFIER | github.com/XingTuLab/JSIMPLIFIER | NDSS 2026. Multi-stage pipeline. Optional LLM renaming. 88.2 percent complexity reduction |
| j4k0xb/webcrack | github.com/j4k0xb/webcrack | Deobfuscates obfuscator.io output. Unpacks webpack |
| relative/synchrony | github.com/relative/synchrony | javascript-obfuscator cleaner |
| ben-sb/javascript-deobfuscator | github.com/ben-sb/javascript-deobfuscator | TypeScript deobfuscator |
| jehna/humanify | github.com/jehna/humanify | LLM-powered JS identifier renaming |
| defuscator/awesome-javascript-deobfuscation | github.com/defuscator/awesome-javascript-deobfuscation | Curated index with safety annotations |

#### Android unpacking

| Tool | URL | Note |
|---|---|---|
| Huai-Tian/Exuvia | github.com/Huai-Tian/Exuvia | Deterministic Android unpacking plus LLM work packages. Four deterministic merge gates |
| index-login/MobileRE-Skill | github.com/index-login/MobileRE-Skill | Unpacking pipeline. Memory DEX dump. Dex-to-C handoff |
| P4nda0s rev-dex-dumper | github.com/P4nda0s/reverse-skills | Runtime DEX dump for packers |

### 7.6 Protocol and format reverse engineering

| Tool | URL | Technique | AI role |
|---|---|---|---|
| Moosa-Salehi/protocol_reverse_engineering | github.com/Moosa-Salehi/protocol_reverse_engineering | PCAP to message-type discovery to field boundaries to Wireshark Lua export | Optional LLM stages are evidence-gated. Honest finding: LLMs add no measurable gain on structure |
| Substrat | nicolashedoire.github.io/substrat-landing | Deterministic Rust pcap-to-grammar learner. Ships MCP server | LLM drives the deterministic engine |
| ProtoForge | github.com/cy3erm/ProtoForge | Record, infer, verify against live target, fuzz. SQLite evidence store | Verification-guided |
| Reverseloom | github.com/KuiChi-x/reverseloom | Browser agent with CDP breakpoints. Reproduces signed/encrypted request generators | End-to-end web API RE agent |
| TracePcap | github.com/NotYuSheng/TracePcap | Self-hosted PCAP platform. LLM narratives. Offline via Ollama | LLM for narrative and filter generation |
| NetForensicMCP | github.com/kylecui/NetForensicMCP | tshark-backed MCP forensics tools | LLM context management |
| wireshark-mcp | github.com/andsopwn/wireshark-mcp | Wireshark MCP with bounded LLM summaries | LLM reasons over summaries not raw packets |
| 010-editor-mcp | github.com/AuroraAeon/010-editor-mcp | LLM to 010 Editor live buffer plus .bt template runner | Template generation and validation |
| Kaitai Struct | kaitai.io | Declarative binary format language. V0.11 added serialization | LLM generates .ksy specs |
| MARISSA | github.com/reverseame/MARISSA | pcap to clustered aligned message formats | Deterministic front-end for LLM |
| Netzob | github.com/netzob/netzob | PRE toolkit. Inference, FSM, fuzzing, dissector export | Foundation tool |
| PRE Workbench | luelista.github.io/pre_workbench | Interactive hex plus grammar workbench. Lua dissector codegen | LLM writes the grammar DSL |

Academic PRE with LLM:

| Paper | Venue | Technique |
|---|---|---|
| MALPRE | IEEE ISSRE 2025 | Code slicing plus 3-agent loop for malware protocol inference |
| ChatPRE | J. Network and Computer Applications 2026 | Pin taint tracking plus IDA pseudo-C plus LLM agent |
| SemPRE | arXiv 2610.31844 | Recursive LLM tree-of-thought over taint traces. EM refinement |
| USENIX Sec 2026 adversarial spec | USENIX Security 2026 | LLM generates format spec plus reference parser. Cross-verifies |

### 7.7 Matching decompilation and recompilation

This is the game-reverse-engineering workflow. The goal is source code that compiles to the same bytes as the original.

#### The workflow

1. Disassemble the target.
2. Write C that matches the disassembly.
3. Compile with the original compiler.
4. Diff the output against the original (objdiff).
5. Iterate until byte-match.

AI fits at step 2: the LLM proposes C. The compiler and objdiff verify.

#### Key projects

| Project | URL | Platform | Status |
|---|---|---|---|
| decomp.me | decomp.me, github.com/decompme/decomp.me | Collaborative matching platform. REST API | Active. Self-hostable |
| objdiff | github.com/encounter/objdiff | Byte-diff scoring engine | Standard tool |
| asm-differ | github.com/simonlindholm/asm-differ | objdump diff | Maintained |
| decomp-permuter | github.com/simonlindholm/decomp-permuter | Automated C permutation for byte-match | Maintained |
| N64Recomp | github.com/N64Recomp/N64Recomp | Static MIPS to C recompiler | Active. 8.3k stars |
| Zelda64Recomp | github.com/Zelda64Recomp/Zelda64Recomp | Majora's Mask PC port | Active. Bans GenAI contributions |
| zeldaret/oot, /mm | github.com/zeldaret | Matching decomps. OOT at 100 percent | Active |
| n64decomp/* | github.com/orgs/n64decomp | sm64, mk64, GoldenEye, banjo-kazooie | Mixed. Sm64 frozen 2024 |
| sm64pc/sm64ex | github.com/sm64pc/sm64ex | SM64 PC port | Active |
| pmret/papermario | github.com/pmret/papermario | Paper Mario N64 decomp | About 100 percent US |
| OpenCE | github.com/OpenCommunityEdition/OpenCE | Halo CE decomp port | Very active |
| gta-reversed | github.com/gta-reversed/gta-reversed | GTA:SA reimplementation | Active. About 50-60 percent |
| DS Decomp Studio | github.com/liolu/ds-decomp-studio | Human plus AI work queue for DS decomps | New. Qwen via Ollama plus Claude briefs |
| rebrew | github.com/maci0/rebrew | Compiler-in-loop matching workbench. Six agent workflows | New. Active |
| decomp-goal-harness | github.com/Muhtasham/decomp-goal-harness | Codex-goal matching-decomp loop | Active. ICML 2026 paper |
| decompdecomp | github.com/RetroReversing/decompdecomp | Desktop app for agentic matching decomp | Alpha |
| n64hub | github.com/n64hub | About 25 AI-written N64 recomps | New October-November 2026 |

#### AI-assisted matching decomps

- **decomp.wtf** — github.com/i12bp8/decomp.wtf — MCP-driven harness for byte-exact matching decomp across N64, PS1, PS2, GameCube, Wii, GBA, DS. **Discontinued October 2026** after community opposition. MIT code remains.
- **ReverseApoc** — github.com/ayrtondenner/ReverseApoc — X-COM Apocalypse DOS decomp, explicitly AI-assisted with Claude Code, every match byte-verified.
- **DS Decomp Studio** — has a Qwen-via-Ollama button that tries matches verified by `match.py verify`, plus a "brief" generator to hand blocks to Claude.
- **rebrew** — compiler-in-loop workbench with six packaged agent workflows.

#### Console recompilation (2026 paradigm)

The dominant 2026 console workflow is static recompilation, not byte-exact decomp.

| Project | URL | Console |
|---|---|---|
| PSXRecomp | github.com/RetroPortingToolKit/psxrecomp | PlayStation 1 |
| PCSX-Redux | github.com/pcsx-redux/pcsx-redux | PS1 emulator with REST API, Lua, OpenBIOS |
| PS2Recomp | github.com/ran-j/PS2Recomp | PlayStation 2 |
| nxrecomp | github.com/drakolordx7/nxrecomp | Nintendo Switch / Switch 2 |
| LASRecomp | github.com/peiikai/LASRecomp | Switch Link's Awakening |
| SavageWindRecomp | github.com/Revivedx/SavageWindRecomp | Switch Breath of the Wild |
| SwitchRecomp (bgyss) | github.com/bgyss/SwitchRecomp | Switch spec-driven recomp research |
| SwitchRecomp (kaiyao7) | github.com/kaiyao7/SwitchRecomp | Switch AArch64 to IR to C |
| XenonRecomp | github.com/hedge-dev/XenonRecomp | Xbox 360 |
| romdev | github.com/monteslu/romdev | 19 consoles as WASM. 38 MCP tools. Matching decomp for N64/PS1 |

Case study: the Tomba! PS1 recomp (1379.tech) used Claude Opus plus Ghidra plus PCSX-Redux to build a MIPS-to-C++ recompiler in about three weeks. The workflow shifted from task-level prompting to goal-level prompting, with attract-demo determinism as the validation oracle.

### 7.8 Firmware and embedded

#### Extraction and analysis

| Tool | URL | What it does |
|---|---|---|
| Binwalk v3 | github.com/ReFirmLabs/binwalk | Rust rewrite. Signature scan, recursive extraction, entropy |
| unblob | github.com/onekey-sec/unblob | 78+ format recursive firmware extractor. JSON reports |
| moria | github.com/nmatt0/moria | Firmware file, key, filesystem identifier and carver |
| FACT | github.com/fkie-cad/FACT_core | Web-UI firmware analysis, comparison, SBOM. REST API |
| EMBA | github.com/e-m-b-a/emba | Firmware malware and vulnerability scanner. SBOM. Emulation |
| FirmAE | github.com/pr0v3rbs/FirmAE | Automated Linux firmware rehosting in QEMU |
| Firmadyne | github.com/firmadyne/firmadyne | Original QEMU firmware emulation. Legacy |
| vmlinux-to-elf | github.com/marin-m/vmlinux-to-elf | Rebuild ELF from kernel image via kallsyms |
| ghidra-firmware-utils | github.com/al3xtjames/ghidra-firmware-utils | Ghidra loaders for PCI ROM, FMAP/IFD/CBFS, UEFI FV/FFS |

#### AI-assisted firmware platforms

| Project | URL | Technique |
|---|---|---|
| FIRMHIVE | arxiv.org/abs/2511.18438 | Recursive tree-of-agents for firmware security analysis |
| FirmAgent | github.com/vul337/FirmAgent | NDSS 2026. IDA pre-fuzzing plus QEMU rehosting plus LLM taint-to-PoC |
| FirmLLM | github.com/zhang-xr/FirmLLM | Multi-agent firmware collection and analysis |
| ripcord | github.com/DavidClawson/ripcord | PyGhidra to DuckDB fact warehouse. Execution oracle. Claude skills |
| HexGraph | github.com/branover/hexgraph | Sandboxed agentic vulnerability-research platform |
| revenant | github.com/DatanoiseTV/revenant | LLM RE for abandoned hardware. Peripheral inventory. Pin-map reconstruction |
| binary-re | github.com/2389-research/binary-re | Claude plugin. Hypothesis-driven ARM/ELF RE |

#### Hardware access

| Tool | URL | What it does |
|---|---|---|
| flashprobe-mcp | github.com/okhsunrog/flashprobe-mcp | probe-rs and espflash MCP. JTAG/SWD/UART flash and monitor. Bounded capture |
| jlink-mcp | github.com/Klievan/jlink-mcp | J-Link, OpenOCD, Black Magic probe MCP |
| TegraRcmGUI | github.com/eliboa/TegraRcmGUI | Switch Tegra RCM exploit tooling |
| fusee-nano | github.com/DavidBuchanan314/fusee-nano | Minimal C reimplementation of Fusée Gelée |
| Ghidra-Switch-Loader | github.com/Adubbz/Ghidra-Switch-Loader | Ghidra loader for Switch binaries and firmware |

### 7.9 Mobile RE

#### Android

| Tool | URL | What it does |
|---|---|---|
| jadx-ai-mcp | github.com/zinja-coder/jadx-ai-mcp | JADX-GUI plugin exposing live decompiler over HTTP. Rename, xref, debug, comments |
| jadx-mcp-server | github.com/zinja-coder/jadx-mcp-server | Python FastMCP adapter. 34 tools |
| apktool-mcp-server | github.com/zinja-coder/apktool-mcp-server | apktool decode/build/smali-edit via MCP |
| jadx-headless-mcp | github.com/1013503897/jadx-headless-mcp | Headless jadx-core MCP. 26 tools. Claude Code plugin |
| revoid | github.com/samudoria/revoid | Headless jadx-core MCP plus call-graph index |
| delamain | github.com/xjoker/delamain | Production headless JADX MCP. Docker. Bearer auth. Frida hook generation |
| dexdec | github.com/asLody/dexdec | Rust decompiler workbench plus live MCP. Higher fidelity than jadx |
| APKLab | github.com/APKLab/APKLab | VS Code workbench. Apktool plus jadx plus smali-lsp. Frida hook generation |
| jadx-mcp-plugin | github.com/mobilehackinglab/jadx-mcp-plugin | Minimal JADX plugin plus FastMCP adapter |
| jebmcp | github.com/flankerhqd/jebmcp | JEB Pro as MCP |

#### Frida for mobile

| Tool | URL | Note |
|---|---|---|
| kahlo-mcp | github.com/FuzzySecurity/kahlo-mcp | Most serious Frida MCP. Session lifecycle. Versioned modules |
| frida-c2-mcp | github.com/s4dp4nd4/frida-c2-mcp | On-device Frida MCP for Android and iOS |
| frida-mcp | github.com/dnakov/frida-mcp | Original stdio Frida MCP |
| frida-analykit | github.com/ZSA233/frida-analykit | Frida env management plus MCP plus TypeScript agent runtime |
| mcp-termux | github.com/PhoenixHairpin/mcp-termux | 73-tool on-device Android RE MCP. EBPF plus kernel memory |

#### iOS

| Tool | URL | Note |
|---|---|---|
| incogbyte/iOS-reverse-engineering-claude-skill | github.com/incogbyte/iOS-reverse-engineering-claude-skill | ipsw class-dump. API discovery. 14-category audit |
| Cassian433/ioskit | github.com/Cassian433/ioskit | Jailbroken-iOS agent toolkit. 28-tool MCP |
| P4nda0s rev-ios-dump | github.com/P4nda0s/reverse-skills | frida-ios-dump IPA decryption |

### 7.10 Managed code (.NET, Java, Go, Rust)

Managed code is the easiest target for LLMs because decompilers produce near-source output.

#### .NET

| Tool | URL | Note |
|---|---|---|
| ILSpy / ilspycmd | github.com/icsharpcode/ILSpy | Cross-platform .NET decompiler. CLI perfect for piping to LLM |
| dnSpyEx | github.com/dnSpyEx-Project/dnSpy | Debug plus edit plus decompile GUI. Windows/Wine. V6.6.0 |
| dotPeek | jetbrains.com/decompiler | Free. GUI only. Not scriptable |
| dnlib | github.com/0xd4d/dnlib | .NET metadata read/write library |

Workflow: `ilspycmd -p -o outdir target.dll` then feed the tree to the LLM.

#### Java

| Tool | URL | Note |
|---|---|---|
| Vineflower | github.com/Vineflower/vineflower | Modern Java decompiler. Java 21+ support. Default choice |
| CFR | github.com/leibnitz27/cfr | Fast Java decompiler. Good second opinion |
| Procyon | github.com/mstrobel/procyon | Effectively unmaintained |
| jadx | github.com/skylot/jadx | Dex and Java decompiler. GUI plus CLI plus plugins |

#### Go

| Tool | URL | Note |
|---|---|---|
| GoReSym | github.com/mandiant/GoReSym | Go symbol/type/file recovery to JSON. Works on stripped binaries |
| gore / redress | github.com/goretk/gore, github.com/goretk/redress | Go binary analysis library plus CLI |

Workflow: run GoReSym first, feed the JSON to the LLM, then use Ghidra or radare2 MCP for the disassembly. No Go-specific decompiler LLM exists.

#### Rust

| Tool | URL | Note |
|---|---|---|
| Ghidra Rust module | inside Ghidra 11+ | Built-in demangling. Legacy and v0 schemes |
| ReOxide | community | Decompiler plugin system for Rust RE |
| kuna | github.com/Noelo-Lab/kuna | Agent-first Rust decompiler |

Rust pseudo-C is the hardest target of the four because generics monomorphize and panic machinery obscures control flow.

---

## 8. Malware Analysis with LLMs

### 8.1 Production systems

| System | URL | What it does |
|---|---|---|
| VirusTotal AI / Code Insight | ai.virustotal.com | LLM analyst reports. Pruning-based HLIL summarization into Gemini 1M context |
| Mandiant XRefer | github.com/mandiant/xrefer | Gemini-assisted IDA plugin. Cluster navigation |
| Microsoft Project Ire | github.com/microsoft/project-ire | Autonomous LLM malware classifier. 89 percent precision, 26 percent recall |
| SentinelOne adversarial consensus | sentinelone.com/labs | Multi-agent pipeline. Radare2, Ghidra, Binary Ninja, IDA as skeptical subagents |
| ANY.RUN private AI | any.run | Sandbox-integrated LLM. Summarizes processes, Suricata, HTTP, registry |
| Joe Reverser | joesecurity.org/joe-reverser | Agentic LLM malware RE. Static plus dynamic. MacOS support |
| Rubrik AMAS | zerolabs.rubrik.com | Proprietary LLM malware analysis. Found real APT samples |

### 8.2 Open-source agentic frameworks

| Project | URL | Note |
|---|---|---|
| Arkana | github.com/JameZUK/Arkana | 250+ tool MCP malware lab |
| agentic-malware-analysis | github.com/mrphrazer/agentic-malware-analysis | Kali Docker env. 50+ tools. MCP backends |
| malware_re_agent | github.com/chadcox/malware_re_agent | LangGraph static triage to STIX/ATT&CK |
| malhaus | github.com/toorandom/malhaus | Self-hosted triage platform with MCP |
| Malyzer | github.com/zrnge/Malyzer | Ollama-driven agentic loop. FlareVM-targeted |
| OpenClaw (taha-a-j) | github.com/taha-a-j/OpenClaw | 6-agent static triage with RAG memory |
| AETHER | github.com/CSIT-SG/AETHER | IDA Pro LLM copilot. Annotation, renaming, struct creation |
| RevGraph | github.com/allsmog/revgraph | Neo4j plus LLM RE graph SDK |
| MaLAware | github.com/bikasaha/MaLAware | Behavior-narrative generator for malware |

### 8.3 Honest capability assessment

- MalwareBench: best model scored 7.6 percent best@3. Real malware RE is far from solved.
- Project Ire: 89 percent precision but 26 percent recall. Useful as a triage filter, not a verdict.
- Refusals remain a blocker: 10-26 percent of malware-RE rollouts are refused by frontier models.
- Fine-tuned small models can match general models on narrow tasks: MalQwen (LoRA-tuned Qwen2.5-7B) beat GPT-4-class models on report quality.
- The consensus: LLMs are useful triage assistants, not autonomous analysts.

---

## 9. Models, Cost, and Context

### 9.1 Cost figures

| Source | Figure |
|---|---|
| SRE-Bench | $0.50 to $42.5 per instance depending on model and effort |
| SentinelLABS Sol Searching | 23 billion tokens across all runs. One GLM-5.2 run cost $100 for 267 million tokens |
| DecBench | $1.0-1.2 per function for gpt-6-astra. $6.6 for claude-opus-4-8 |
| GPT-WPRE (2023) | $16.60 for a 466-function library at davinci-003 pricing |
| Kong XZ benchmark | $6.63 for a full backdoor reconstruction |
| Claroty Team82 | $6 and 28 minutes for a Danfoss controller vulnerability reproduction |

### 9.2 Context-window strategies

Whole binaries do not fit in context. The proven patterns:

| Pattern | How it works | Example |
|---|---|---|
| Map-reduce over functions | Summarize callees before callers. Chunk oversized functions | GPT-WPRE |
| RAG over functions | Vector-store retrieval of relevant functions | OGhidra, r2ai |
| Fact warehouse | Deterministic extraction to Parquet/DuckDB. LLM queries the warehouse | ripcord |
| Progressive disclosure | Small tool surface. Agent writes code to compose operations | Hex-Rays ida-mcp code mode |
| Token-lean CLI | Compact output schemas. Spill-to-file for large results | hermes-rea-cli |
| Per-function prompts | One decompiled function per call | GptHidra |

### 9.3 The compaction problem

SentinelLABS found that context compaction cut input tokens by about 86 percent but degraded recovery of higher-level objects. Models lose track of unfinished work when context is compacted.

Mitigations:

- Keep exact evidence outside compacted context (VerifiedIDA pattern).
- Use a ledger or notebook that survives compaction.
- Prefer selective retrieval over greedy fetching.
- The "Humans versus Machines" study found agents exhibit "greedy fetching" — broad retrieval with no revisits — which saturates context windows on real binaries.

### 9.4 Local models

| Option | URL | Notes |
|---|---|---|
| Ollama | ollama.com | Simplest local model runtime. OGhidra and r2ai integrate |
| llama.cpp | github.com/ggml-org/llama.cpp | Lower-level local inference |
| vLLM | github.com/vllm-project/vllm | Production serving. Sidekick supports it |
| LLM4Decompile | github.com/albertan017/LLM4Decompile | Specialist decompilation models. 1.3B to 33B |
| Qwen3-Coder-Next | huggingface.co/Qwen | Best open code model for local RE. 30B-A3B |

Hardware rules of thumb for 2026:

- 7-9B Q4 models: 8-16GB VRAM or RAM. Weak on obfuscated code.
- 27-32B Q4 models: 20-24GB VRAM.
- 70B+ models: 48GB+ or heavy CPU offload (slow).
- Ghidra itself wants 4-16GB heap (`GHIDRA_HEADLESS_MAXMEM`).

### 9.5 The safety-classifier problem

Since about October 21, 2026, Claude Opus 5.5 reportedly halts RE and decompilation requests mid-answer. Anthropic routes cyber tasks to Opus 4.8. Community backlash also contributed to the decomp.dev shutdown.

Practical impact: frontier Claude usability for RE is degraded. Use Opus 4.8, or use GPT/Gemini/open models for RE tasks.

---

## 10. Verification and Trust

### 10.1 Why verification is mandatory

LLM agents hallucinate. The measured evidence:

- SentinelOne found that half of cited functions in agent RE reports were wrong.
- The "Decompiling the Synergy" study found "find vulnerability" prompts produced hallucinated buffer overflows that cost 231 percent more wasted time.
- NDSS BAR 2026 found agents over-trust decompiler output and exhibit training bias.
- reverify benchmarked a model whose textbook answers were wrong 97 percent of the time on real Windows binaries.

### 10.2 Verification tools

| Tool | URL | What it verifies |
|---|---|---|
| reverify | github.com/2akouwu/reverify | LLM claims about a binary. Deterministic tools return VERIFIED/REFUTED/INCONCLUSIVE |
| objdiff | github.com/encounter/objdiff | Byte-level diff between compiled candidate and original |
| decomp.me | decomp.me | Collaborative matching-decomp platform with scoring |
| rebrew | github.com/maci0/rebrew | Compiler-in-loop matching workbench |
| DecompPipeline | github.com/GeneralAtrox/DecompPipeline | Emulator-backed judge proves behavioral equivalence |
| Paleblood | github.com/Yharnam-Hunters/Paleblood | Functional verification against original on recorded inputs |
| VerifiedIDA | github.com/SentineLabs/verified-ida | Evidence-anchored IDA annotations. Ledger survives compaction |
| re-ground | github.com/shouvikkkk/re-ground | Re-derives every address/string/import claim against the binary |
| ghidra-cli | github.com/akiselev/ghidra-cli | Headless Ghidra automation with JSON output for agents |

### 10.3 The verification patterns

| Pattern | How it works | Used by |
|---|---|---|
| Compile-and-diff | LLM writes C. Compiler produces bytes. Objdiff scores | Matching decomps, rebrew, DecompPipeline |
| Execute-and-compare | Run original and candidate. Compare behavior | Paleblood, ReAgent |
| Claim checking | LLM proposes. Deterministic tool decides | reverify, vmp-reverse-skill |
| Cross-tool consensus | Multiple tools must agree | SentinelOne engine, Maljan |
| Human gate | Explicit checkpoint before promotion | Rikugan, Eleven, zsec.uk pipeline |
| Evidence ledger | Every claim links to a tool output | REA, VerifiedIDA, Maljan |

### 10.4 Human-in-the-loop checkpoints

The best HITL designs found:

- **Rikugan**: explicit commands `/plan /modify /explore /undo /memory`. Checkpoints are commands, not implicit prompts.
- **Eleven**: patching with accept/decline cards. Per-change authorship log.
- **zsec.uk production fleet**: all findings start in `hallucinations/` and must pass Gates 0-3 (PoC compiles, reproduces, exploitable, low-privilege) before promotion.
- **Exuvia**: four deterministic merge gates before LLM output enters the pipeline.
- **vmp-reverse-skill**: LLM outputs executable claims. Z3 returns PROVEN/REFUTED/FUZZED/UNVERIFIED.

---

## 11. Isolation and Security

This section is critical. Feeding untrusted binaries to LLM agents is a documented attack surface.

### 11.1 Documented attacks

| Attack | Source | What happens |
|---|---|---|
| Prompt injection via compiled strings | arXiv 2605.30667 | Injection strings survive compilation. Mimic ChatML tokens. Fake decompiler output for a different target. 100 percent success with Qwen3-8B |
| Obfuscated injection | arXiv 2605.30677 | Non-printing bytes hide payloads from `list_strings` while `decompile_function` still shows them. Bracket substitution defeats regex |
| Representation confusion | arXiv 2607.12507 | Binary strings promoted to instruction authority. Provenance-blind gates validate 32/32 false claims |
| Semantic reframing | arXiv 2609.19722 (ALIBI) | Non-executed PE section with false "security product" narrative. 85.7 percent success on Gemini 2.5 Pro |
| Skynet sample | Check Point Research June 2025 | First documented malware with embedded prompt injection |
| macOS.Gaslight | SentinelOne June 2026 | Rust backdoor with 38 fabricated "system" messages mimicking an LLM triage harness |
| CAIRN A3 | Cisco Talos October 2026 | Four malware families. Template-sprayed payloads in seven LLM chat formats. Best techniques steered 35 percent of runs to benign |
| Shai-Hulud worm | socket.dev 2026 | Supply-chain worm modifies `~/.claude.json` and MCP configs. Injects rogue MCP server |
| Ghidra CFStrings RCE | GHSA-mc3p-mq2p-xw6v | Malicious Mach-O strings with `{@execute}` annotations. Arbitrary code execution when comments clicked |
| GhidraMCP audit | issues #140/#141 | Unauthenticated HTTP server. Prompt injection through decompiled output. Persistent stored injection through comment write-back |
| Tool poisoning | Trail of Bits April 2025 | Malicious MCP tool descriptions inject instructions before any tool is invoked |
| Rug pull | Microsoft April 2025 | Hosted MCP servers can amend tool definitions after approval |

### 11.2 Isolation options

| Option | URL | Isolation strength | Snapshot | Agent control | Cost |
|---|---|---|---|---|---|
| Docker | docker.com | Namespaces plus cgroups. Shared kernel. Weakest | No native snapshots | Full CLI/API | Free |
| gVisor runsc | github.com/google/gvisor | Userspace kernel. Strong vs kernel exploits | No checkpoint/restore | OCI runtime drop-in | Free |
| Kata Containers | github.com/kata-containers | VM per container. QEMU, Firecracker, Cloud-Hypervisor | VM snapshot semantics | Standard OCI APIs | Free |
| Firecracker | github.com/firecracker-microvm | KVM microVM. Minimal device model. Seccomp plus Jailer | Snapshot/restore supported | REST API. Vsock | Free |
| QEMU | qemu.org | Full VM emulation. TCG or KVM | Snapshot savevm/load | QMP, libvirt | Free |
| nsjail | github.com/google/nsjail | Namespaces plus seccomp-bpf. Process level | No | CLI plus protobuf config | Free |
| Unicorn | github.com/unicorn-engine/unicorn | CPU emulation only. No OS layer | N/A | Python/C bindings | Free |
| Qiling | github.com/qilingframework/qiling | Full user-mode OS emulation | Save/restore API | Python. GDB stub | Free |
| E2B Runtime | github.com/e2b-dev/runtime | Open-source Firecracker sandbox platform | Snapshot, resume, fork, pause | REST API plus SDKs | Apache-2.0 self-host |

### 11.3 Sandboxed RE environments

| Environment | URL | What it provides |
|---|---|---|
| REMnux | remnux.org, github.com/REMnux/remnux-mcp-server | Linux malware-analysis distro. MCP server. OpenCode pre-installed. GhidraMCP bundled |
| CAPEv2 | github.com/kevoreilly/CAPEv2 | Windows sandbox. Automated unpacking. YARA config extraction. REST API |
| CAPEsolo | github.com/CAPESandbox/CAPEsolo | Standalone Windows CAPE monitor. MCP server. Headless CLI |
| CAPE-mcp | github.com/CAPESandbox/CAPE-mcp | MCP server for CAPEv2 API |
| CAPEvm | github.com/CAPESandbox/CAPEvm | Pre-built KVM hypervisor plus CAPE controller |
| FLARE-VM | github.com/mandiant/flare-vm | Windows RE toolbox installer. IDA, x64dbg, Ghidra |
| SIFT Workstation | SANS | DFIR distro. Distribution status unverified |
| ANY.RUN | any.run | Cloud interactive sandbox. REST API |
| Joe Sandbox | joesandbox.com | Cloud sandbox. Native physical machines for VM-aware malware. MacOS Apple Silicon |
| Falcon Sandbox | hybrid-analysis.com | CrowdStrike community sandbox |
| ida-instances | panel.idainstances.xyz | Hosted single-tenant IDA Pro 9.4 with MCP. Egress dropped by default |

### 11.4 Mitigations

The evidence supports a layered posture:

1. **Run the agent and MCP servers in a container or VM.** No production credentials. Egress allowlist.
2. **Treat every tool output as untrusted data.** Provenance-tag it. Render as data, not instructions. Never let tool output authorize tool calls.
3. **Sanitize at the tool boundary.** Use a classifier, not regex. Scan all tool outputs including decompile results.
4. **Use read-only MCP modes.** Disable write tools (rename, comment) during untrusted-binary sessions. Persistent comment injection is a demonstrated channel.
5. **Prefer local models for hostile samples.** Air-gap removes exfiltration and provider leakage. Cost: weaker models are more injectable.
6. **Gate the agent's shell and network.** Proxy firewall, prompt-injection classifier, human approval for irreversible actions.
7. **Update Ghidra.** GHSA-mc3p-mq2p-xw6v is fixed in Ghidra 12.0.3+.
8. **Vet MCP servers.** Tool poisoning and rug pulls are documented. Use AgentSeal, mcp-fence, or Docker MCP Gateway.

### 11.5 Security tools for the agent layer

| Tool | URL | What it does |
|---|---|---|
| AgentSeal | github.com/getagentseal/agentseal | Scan for poisoned MCP configs. Guard. Shield. Scan-mcp |
| mcp-fence | github.com/DaoyuanLi2816/mcp-fence | MCP security scanner plus Docker sandbox wrapper |
| mcpjail | mcpjail.com | Proxy plus Docker sandbox for MCP servers. Audit log |
| Docker MCP Gateway | github.com/docker/mcp-gateway | Official Docker MCP plugin. Container isolation. Tool allowlists |
| LlamaFirewall | github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall | PromptGuard 2 injection classifier. AlignmentCheck. CodeShield |
| LiteLLM guardrails | docs.litellm.ai | Proxy-level guardrails. Prompt Security, Straiker, XecGuard |
| CodeSentinel | arxiv.org/abs/2606.19235 | Research sanitizer for code-context injection |
| Anthropic sandbox-runtime | github.com/anthropic-experimental/sandbox-runtime | OS-level filesystem and network sandbox |

---

## 12. Cloud and Remote Infrastructure

### 12.1 Hosted IDA

**ida-instances** — panel.idainstances.xyz

- Commercial hosted IDA Pro 9.4.
- Single-tenant containers with browser-streamed GUI.
- 66-tool MCP server (fork of ida-pro-mcp hardened).
- About 90 seconds from launch to first decompile.
- 110MB upload ceiling.
- About 60-minute idle reap.
- Outbound egress dropped by default (air-gapped).
- The most turnkey hosted IDA plus MCP offering.

### 12.2 Codespaces for RE

**sanchomuzax/codespace-x86-re-toolkit** — github.com/sanchomuzax/codespace-x86-re-toolkit

- Python CLI automates the full ephemeral lifecycle: create Codespace, setup pinned Ghidra 12.1.2 plus Java 21, upload binary, `analyzeHeadless`, run scripts, download evidence, delete Codespace.
- Ships as an Agent Skills package for Codex and Claude Code.
- Includes a `rea-mcp` subcommand that exposes the Codespace's Ghidra to a local REA agent.
- Security posture: binaries never committed. `/var/tmp` scratch. Header-validated x86 PE/ELF only. Exact-name cleanup.
- Best turnkey cloud-RE workflow found.

**clearbluejar/ghidra-python-vscode-devcontainer-skeleton** — github.com/clearbluejar/ghidra-python-vscode-devcontainer-skeleton

- Long-lived Ghidra devcontainer for VS Code and Codespaces.
- Java plus pyghidra plus ghidra-bridge RPC.

**alexmi256/rea-agent-docker** — github.com/alexmi256/rea-agent-docker

- Docker images packaging REA plus engines: Ghidra 12.1.4, Hopper 6.6.1, IDA (BYO license).
- About 229 MCP tools.
- Full toolchain: pwntools, Frida, JADX, mitmproxy, WABT, binwalk/unblob, qemu-user, wine.
- GHCR-published.
- The most complete "RE workstation in a container" artifact.

### 12.3 Remote MCP servers

The pattern: run Ghidra or IDA headless on a server, expose MCP over HTTP, connect the agent from your workstation.

| Server | Remote capability |
|---|---|
| LaurieWired/GhidraMCP | `--ghidra-server http://host:8080/` points at a remote Ghidra plugin |
| jtsylve/re-mcp | `proxy` mode auto-spawns persistent HTTP daemon with bearer-token auth |
| bethington/ghidra-mcp | Docker deployment. HTTP transports |
| blacktop/ida-mcp-rs | HTTP worker pool. `--max-workers` |
| clearbluejar/pyghidra-mcp | Streamable HTTP. GHCR image |

### 12.4 CI pipelines for binary diffing

| Tool | URL | What it does |
|---|---|---|
| ghidriff | github.com/clearbluejar/ghidriff | PyGhidra CLI binary differ. Docker image. CI-friendly |
| patchdiff | github.com/AmerMrkaljevic/patchdiff | Security-ranked patch diffing. `--json` output for CI |
| setup-ghidra | github.com/er28-0652/setup-ghidra | GitHub Action to install Ghidra on runners |

---

## 13. Learning Resources

### 13.1 Paid trainings

| Course | URL | AI relevance |
|---|---|---|
| REcon 2026 "Automating RE with AI/ML, Graphs, and LLM Agents" | recon.cx/2026/en/trainingAutomatingREwithAIML.html | Blackfyre, Neo4j program graphs, AutoGen/MCP agents, LLaMA fine-tuning |
| REcon 2026 "Building Agentic RE" | recon.cx/2026/en/trainingBuildingAgenticRE.html | Private LLM stack, custom MCP servers, QLoRA, DSPy/LangGraph, Chainlit HUD |
| REcon 2026 "AI Agents for Cybersecurity" | recon.cx/2026/en/training.html | DL and LLM applied to malware analysis and RE |
| REcon 2026 "Software Deobfuscation Techniques" | recon.cx/2026/en/trainingSoftwareDeobfuscationTechniques.html | Agent-assisted workflows mentioned |
| Black Hat USA 2025 "Automating RE with AI/ML" | cert.blackhat.com | Same team as REcon. Blackfyre platform |
| FuzzingLabs "Applied AI/LLM for Android APK Reversing" | fuzzinglabs.com | Jadx MCP, Ghidra MCP, AI decompilation, Frida script generation |
| Udemy "AI and MCP for Reverse Engineering" | udemy.com | Self-paced. MCP with Claude Desktop. Verify instructor credibility |
| TrainSec "Malware Analysis and Development" | trainsec.net | Foundational maldev. No AI module |

### 13.2 Free curricula

| Resource | URL | What it covers |
|---|---|---|
| RE4B "Reverse Engineering for Beginners" | beginners.re | Canonical free RE textbook. Assembly, calling conventions, memory, Windows/Linux internals |
| pwn.college | pwn.college/dojos | Gamified CTF curriculum. Reverse-engineering dojo. No AI content |
| RPISEC MBE | github.com/RPISEC/MBE | Classic exploitation curriculum. Dated |
| Malware Unicorn RE101 | malwareunicorn.org | Free reverse-engineering workshop |
| OALABS | openanalysis.net | YouTube tutorials. Patreon deep dives. Discord community |
| TryHackMe Windows Reversing | tryhackme.com | Guided rooms |
| City College CNIT 126 | ccny.cuny.edu | Software reverse engineering course |

### 13.3 Community

| Community | URL | Notes |
|---|---|---|
| r/ReverseEngineering | reddit.com/r/ReverseEngineering | About 144k members. Tool releases surface here |
| r/Malware | reddit.com/r/Malware | About 71k members. OALABS workshops |
| OALABS Discord | discord.gg/oalabs | Live RE discussions |
| Ghidra Discord | discord.gg/NXaxkXbfW8 | Ghidra community. MCP ecosystem discussed |
| R.A.I.D. Discord | RetroPortingToolKit | Console recomp community |
| Hacker News | news.ycombinator.com | AI-RE tools surface regularly |

### 13.4 Suggested learning path

1. **Fundamentals**: RE4B (beginners.re) or pwn.college belts. You must know assembly, calling conventions, and memory before AI helps.
2. **Windows malware RE**: Malware Unicorn RE101, OALABS RE101-201, FLARE-VM setup.
3. **The AI layer**: REcon or Black Hat AI-RE course if budget allows. Otherwise the FuzzingLabs APK course or the Udemy MCP course.
4. **Daily driver**: duty1g x64dbg-mcp-server plus GhidraMCP or bethington ghidra-mcp plus ida-pro-mcp or Hex-Rays ida-mcp (or REA for breadth).
5. **Long tail**: awesome-ai-reverse-engineering list for new tools.

---

## 14. Indexes and Directories

### 14.1 Primary RE indexes

| Index | URL | What it indexes | Maturity |
|---|---|---|---|
| Awesome-REA | github.com/reacher-z/Awesome-REA, awesomerea.org | 885 resources, 303 case studies, 207 papers, 3,309 repos. Machine-readable | Active. Best single index |
| ReversingID/Awesome-Reversing | github.com/ReversingID/Awesome-Reversing | Domain-split RE index. Software, hardware, format, database | Active. Curated |
| morluto/awesome-reverse-engineering | github.com/morluto/awesome-reverse-engineering | Task-organized modern RE list. AI-assisted section | New. Very active |
| wtsxDev/reverse-engineering | github.com/wtsxDev/reverse-engineering | Classic general RE list | Stale (2023) but canonical |
| ZX41R/awesome-reverse-engineering-and-malware-analysis | github.com/ZX41R/awesome-reverse-engineering-and-malware-analysis | Verified links. Taxonomy. Researcher blogs | Small but high signal |
| edwardtay/awesome-reverse-engineering | edwardtay.github.io | 135 tools with safety flags | New |
| decompilation.wiki | decompilation.wiki | Decompiler internals and evaluation | Community wiki |

### 14.2 AI-plus-RE indexes

| Index | URL | What it indexes |
|---|---|---|
| zhuyansen/awesome-ai-reverse-engineering | github.com/zhuyansen/awesome-ai-reverse-engineering | 117 repos security-graded. 74 MCP, 17 mobile, 18 skills, 4 case studies. Live at agentskillshub.top |
| DiscoverBox/awesome-ai-reverse-engineering | github.com/DiscoverBox/awesome-ai-reverse-engineering | AI RE tools by form factor. Bilingual |
| ram-elgov/awesome-llm-reverse-engineering | github.com/ram-elgov/awesome-llm-reverse-engineering | LLM-for-RE papers, tools, datasets |
| AIshihzong/awesome-reverse-engineer-anything | github.com/AIshihzong/awesome-reverse-engineer-anything | AI-RE case studies with evidence tags |
| yibie/awesome-rea | github.com/yibie/awesome-rea | AI decomp/recomp/native-port projects |
| crowdere/Awesome-RE-MCP | github.com/crowdere/Awesome-RE-MCP | 28 MCP servers for RE tools |
| nforest/awesome-decompilation | github.com/nforest/awesome-decompilation | Decompilation research including AI |
| suxnju/awesome-ai-for-software-reverse-engineering | github.com/suxnju/awesome-ai-for-software-reverse-engineering | Learning-based RE research |

### 14.3 Malware and security indexes

| Index | URL | What it indexes |
|---|---|---|
| Malpedia | malpedia.caad.fkie.fraunhofer.de | Malware family encyclopedia. YARA rules. ATT&CK mapping |
| rshipp/awesome-malware-analysis | github.com/rshipp/awesome-malware-analysis | Huge malware-analysis taxonomy. Stale since 2024 |
| pedramamini/awesome-yara | github.com/pedramamini/awesome-yara | YARA rules, tools, people |
| vx-underground/MalwareSourceCode | github.com/vxunderground/MalwareSourceCode | Malware source-code corpus by platform |
| sbilly/awesome-security | github.com/sbilly/awesome-security | General security list |

### 14.4 Practice and CTF indexes

| Index | URL | What it indexes |
|---|---|---|
| crackmes.one | crackmes.one | Crackme practice index. Difficulty-rated |
| CTFtime | ctftime.org/ctfs | CTF event archive |
| sajjadium/ctf-archives | github.com/sajjadium/ctf-archives | GitHub CTF challenge collection |
| pwncollege/ctf-archive | github.com/pwncollege/ctf-archive | CTF archive |
| flare-on.com | flare-on.com | FireEye FLARE CTF archives |
| challenges.re | challenges.re | RE challenges |

### 14.5 Tool-specific indexes

| Index | URL | What it indexes |
|---|---|---|
| plugins.hex-rays.com | plugins.hex-rays.com | Official IDA plugin repository |
| Vector35/community-plugins | github.com/Vector35/community-plugins | Binary Ninja plugin index |
| onethawt/idaplugins-list | github.com/onethawt/idaplugins-list | IDA plugin directory. Stale |
| ghidraninja/ghidra_scripts | github.com/ghidraninja/ghidra_scripts | Ghidra scripts collection |
| grayhatacademy/ghidra_scripts | github.com/grayhatacademy/ghidra_scripts | Ghidra scripts collection |
| skills.sh | skills.sh | Agent Skills registry with install counts and security audits |
| agentskills.io | agentskills.io | Agent Skills specification |
| mcp.so | mcp.so | MCP server directory |
| glama.ai/mcp | glama.ai/mcp | MCP server directory with quality grades |
| smithery.ai | smithery.ai | MCP server directory |
| registry.modelcontextprotocol.io | registry.modelcontextprotocol.io | Official MCP registry |
| awesome-angr | github.com/degrigis/awesome-angr | angr ecosystem list |
| awesome-embedded-security | github.com/hexsecs/awesome-embedded-security | Embedded and hardware security |
| SubmitGame/awesome-decomp-games | github.com/SubmitGame/awesome-decomp-games | Decomp and recomp catalog. Auto-refreshed |
| heaven-hm/awesome-reverse-engineered-games | github.com/heaven-hm/awesome-reverse-engineered-games | AI-rebuilt games case studies |
| recomp.fyi | recomp.fyi | Recomp project registry |
| retroportingtoolkit.com | retroportingtoolkit.com | Console recomp collective |

---

## 15. Putting It Together: Recommended Workflows

### 15.1 The minimal viable setup

For a reverse engineer with an existing Ghidra or IDA license:

1. Install Claude Code or Codex CLI.
2. Install the MCP server for your tool:
   - IDA: `uvx ida-hcli mcp install` (official Hex-Rays server, IDA 9.4+)
   - Ghidra: `uvx --from git+https://github.com/bethington/ghidra-mcp ghidra-mcp` or LaurieWired's simpler server
3. Install one skill pack relevant to your work:
   - General: `npx skills add zhaoxuya520/reverse-skill`
   - Ghidra: ReVa skills from cyberkaida/reverse-engineering-assistant
   - Mobile: SimoneAvogadro/android-reverse-engineering-skill
4. Run a bounded task: "Decompile function at 0x401000 and explain the control flow."
5. Verify every claim against the binary.

### 15.2 The malware analysis setup

1. Run a sandbox: CAPEv2 for Windows, REMnux for Linux, or a cloud sandbox (ANY.RUN, Joe Sandbox).
2. Inside the sandbox, run the MCP server for your analysis tool.
3. Connect the agent from outside the sandbox through a tunnel or MCP proxy.
4. Use read-only MCP mode. Disable write tools.
5. Gate all findings through a verification step.
6. Never let the agent execute the sample without a snapshot/rollback mechanism.

### 15.3 The game decomp setup

1. Pick a matching-decomp project on decomp.me or an existing repo.
2. Set up the original compiler toolchain (setup-msvc for MSVC, IDO for N64, mwccarm for DS).
3. Use an agent to propose C for a bounded set of functions.
4. Compile and diff with objdiff.
5. Iterate. The agent proposes. The compiler and diff verify.
6. For recompilation (not byte-match), use N64Recomp, PSXRecomp, or PS2Recomp as the framework.

### 15.4 The firmware setup

1. Extract with Binwalk v3 or unblob.
2. Identify kernels with vmlinux-to-elf.
3. Decompile headless with PyGhidra plus a headless MCP server.
4. Build a fact warehouse (ripcord pattern: Parquet to DuckDB).
5. Let the agent query the warehouse.
6. Use Unicorn or Renode as an execution oracle for verification.
7. For hardware access, use flashprobe-mcp for JTAG/SWD/UART.

### 15.5 The air-gapped setup

1. Run everything on one machine or one LAN.
2. Use local models: Qwen3-Coder-Next via Ollama or vLLM.
3. Use OGhidra for the Ghidra-plus-Ollama bridge, or r2ai for radare2.
4. No network egress. No cloud API calls.
5. Accept weaker results on obfuscated code. The local model is more injectable. Keep the sandbox strict.

---

## 16. What the Evidence Says About AI in RE

### 16.1 Where AI helps

- **Novices**: comprehension improved by about 98 percent in a controlled study. AI is a tutor.
- **Bounded tasks**: decompile this function, rename these symbols, write this script, explain this graph.
- **Triage**: classify malware, extract IOCs, summarize sandbox reports.
- **Repetitive work**: batch renaming, type recovery, comment generation.
- **Documentation**: turn analysis notes into structured reports.

### 16.2 Where AI fails

- **Open-ended questions**: "find the vulnerability" produced hallucinated answers and wasted time.
- **Real malware**: best@3 in low single digits on MalwareBench.
- **Obfuscated code**: combined obfuscation techniques defeat all tested models.
- **Context exhaustion**: greedy fetching saturates context windows on real binaries.
- **Interprocedural reasoning**: program-level success spans 23-81 percent on ICall-Bench.
- **Memorization contamination**: public CTFs and crackmes are memorized. Generated/private corpora discriminate.

### 16.3 The measured success rates

| Benchmark | Best result | Meaning |
|---|---|---|
| InterCode-CTF | 95 percent | Saturated. High-school CTFs no longer discriminate |
| CrackMeBench generated | 92 percent pass@3 | Top model on generated crackmes |
| AgentRE-Bench | 87.4 best, no full credit | Strong but imperfect on purpose-built binaries |
| SRE-Bench | 31.5-82 percent depending on safeguards | Real-world-scale programs. Budget matters |
| MalwareBench | 7.6 percent best@3 | Real obfuscated malware. Far from solved |
| BIOPSY-Bench | 0.01-0.035 pass rate | Expert-level hardened binaries. Near floor |
| DecompileBench | LLMs beat decompilers on readability, trail by 52.2 percent on correctness | Readable but not always correct |

### 16.4 The expert's advantage

The NDSS 2026 study found:

- Novices gained 98 percent comprehension improvement.
- Experts gained little.
- LLM rename accuracy: 85 percent on known algorithms vs human 66 percent. But only 57 percent vs 65 percent overall.
- "Find vulnerability" queries negatively correlated with success.
- LLMs degrade above about 40 lines of code.
- Best observed pattern: function summary, then manual rename.

The implication: AI is a force multiplier for learning and bounded tasks. It is not a replacement for expertise on hard targets.

---

## 17. Anti-Patterns and Pitfalls

### 17.1 Do not do these

- Do not feed raw assembly to the LLM. Feed decompiler pseudocode.
- Do not ask "find the vulnerability" without a bounded scope.
- Do not trust LLM output without verification.
- Do not run untrusted binaries on your main machine.
- Do not expose MCP servers without authentication on non-loopback interfaces.
- Do not install skills or MCP servers from unverified sources.
- Do not use RetDec or Snowman for new work. Both are dead.
- Do not use Manticore for new work. It is archived.
- Do not assume star counts mean quality. Several 2026 repos have inflated or anomalous counts.
- Do not let the agent write comments back to the database during untrusted-binary sessions. Persistent injection is documented.
- Do not skip the tracker when studying a project. Issues and pull requests contain the decisions.

### 17.2 Do these

- Do verify every claim against the binary.
- Do use read-only MCP modes for untrusted work.
- Do keep an evidence ledger that survives context compaction.
- Do use deterministic preprocessing before the LLM sees anything.
- Do use compile-and-diff or execute-and-compare as the verification gate.
- Do read the skill's SKILL.md before trusting it.
- Do check the MCP server's security posture (auth, bind address, write tools).
- Do update your tools. Ghidra 12.0.3+ fixes a real RCE.

---

## 18. Open Questions and Future Watch

### 18.1 Unresolved questions

- Which IR is best for LLMs: VEX, P-Code, MLIL, HLIL, or decompiler C? No rigorous 2025-2026 benchmark compares them.
- Will specialist decompilation models (LLM4Decompile, CodeInverter) surpass frontier general models on real binaries?
- Will the safety-classifier issue on Claude models resolve?
- Will the decomp community's anti-AI stance change the tooling landscape?
- Will MCP become the universal standard for all RE tools, or will in-tool agents (Rikugan, Sidekick, IDA Assist) win?

### 18.2 Things to watch

- Hex-Rays IDA MCP maturity and feature parity with community servers.
- Binary Ninja Sidekick development and pricing.
- REA's evolution and whether independent evaluations confirm its value.
- PUSHAN/yaps devirtualization maturity.
- SRE-Bench and successor benchmarks for honest capability measurement.
- The agent-skills ecosystem: which RE skills survive security audits.
- Local model improvements: Qwen3-Coder-Next and successors for air-gapped work.

---

## 19. Source Index

This section lists the primary sources organized by topic. All URLs were accessed during the research window of November 2026.

### Agent harnesses and MCP servers

- https://github.com/morluto/rea — REA: Reverse Engineer Anything
- https://rea.tools — REA documentation and case studies
- https://github.com/buzzer-re/Rikugan — in-IDA/Binja agent
- https://rikugan.reversing.codes — Rikugan documentation
- https://github.com/amruth-sn/kong — Kong autonomous pipeline
- https://github.com/Dryxio/reagent — ReAgent reconstruction agent
- https://github.com/LING71671/open-reverselab — Open-ReverseLab platform
- https://github.com/openbin-ai/binny — BINNY agent harness
- https://github.com/JameZUK/Arkana — Arkana malware lab
- https://github.com/Zfinix/eleven — Eleven agent-first RE app
- https://github.com/criticic/reagent — Multi-agent binary analysis
- https://github.com/mrphrazer/agentic-malware-analysis — Agentic malware analysis environment
- https://github.com/toorandom/malhaus — Malhaus triage platform
- https://github.com/chadcox/malware_re_agent — Malware RE agent
- https://github.com/branover/hexgraph — HexGraph workbench
- https://github.com/backbay-labs/reverend — Reverend control plane
- https://github.com/phulin/reaper — Reaper workspace
- https://github.com/mrphrazer/reverser_ai — ReverserAI local-LLM naming
- https://github.com/louisgthier/decompai — DecompAI LangGraph agent
- https://openbin.ai — OpenBin browser workspace

### IDA Pro MCP servers

- https://github.com/HexRaysSA/ida-mcp — Official Hex-Rays IDA MCP
- https://hex-rays.com/blog/hex-rays-ida-mcp-server — Announcement blog
- https://github.com/mrexodia/ida-pro-mcp — Community IDA MCP
- https://github.com/blacktop/ida-mcp-rs — Rust headless IDA MCP
- https://github.com/MeroZemory/ida-multi-mcp — Multi-instance IDA MCP
- https://github.com/jtsylve/re-mcp — Unified IDA+Ghidra MCP
- https://github.com/0xshlomil/ida-free-mcp — IDA Free MCP
- https://github.com/P4nda0s/IDA-NO-MCP — IDA export for AI IDEs
- https://github.com/trailofbits/idac — IDA CLI for agents
- https://github.com/mrexodia/mcp-reversing-dataset — RE task dataset

### Ghidra MCP servers

- https://github.com/LaurieWired/GhidraMCP — Original Ghidra MCP
- https://github.com/bethington/ghidra-mcp — 219-tool Ghidra MCP
- https://github.com/cyberkaida/reverse-engineering-assistant — ReVa
- https://github.com/clearbluejar/pyghidra-mcp — PyGhidra MCP
- https://github.com/symgraph/GhidrAssistMCP — GhidrAssistMCP
- https://github.com/symgraph/GhidrAssist — GhidrAssist
- https://github.com/mrphrazer/ghidra-headless-mcp — Headless Ghidra MCP
- https://github.com/elliottophellia/Ryuumonbuchi — Ryuumonbuchi
- https://github.com/cellebrite-labs/ghidra-rpc — Ghidra RPC daemon
- https://github.com/jumpeip/ghidrallm-mcp — Ghidrallm MCP
- https://github.com/akiselev/ghidra-cli — Ghidra CLI
- https://github.com/llnl/OGhidra — OGhidra Ollama bridge
- https://github.com/al3xtjames/ghidra-firmware-utils — Ghidra firmware loaders

### Binary Ninja

- https://docs.binary.ninja/guide/mcp.html — Native MCP documentation
- https://sidekick.binary.ninja — Sidekick AI agent
- https://docs.sidekick.binary.ninja — Sidekick documentation
- https://github.com/fosdickio/binary_ninja_mcp — Community BN MCP
- https://github.com/mrphrazer/binary-ninja-headless-mcp — Headless BN MCP
- https://github.com/banteg/bn — BN CLI bridge

### radare2 / rizin

- https://github.com/radareorg/radare2-mcp — Official r2 MCP
- https://github.com/radareorg/r2ai — r2ai plugin
- https://github.com/radareorg/radare2-skills — r2 skills
- https://github.com/drvcvt/radare2-mcp — TypeScript r2 MCP

### Debuggers

- https://github.com/duty1g/x64dbg-mcp-server — x64dbg MCP
- https://github.com/AgentSmithers/x64DbgMCPServer — x64dbg MCP C#
- https://github.com/SetsunaYukiOvO/x64dbg-mcp — x64dbg MCP JSON-RPC
- https://github.com/mnemonic-re/WinDbgX-MCP — WinDbg MCP
- https://github.com/FuzzySecurity/kahlo-mcp — Frida MCP
- https://github.com/dnakov/frida-mcp — Frida MCP
- https://github.com/s4dp4nd4/frida-c2-mcp — On-device Frida MCP

### Decompilers

- https://github.com/NationalSecurityAgency/ghidra — Ghidra
- https://hex-rays.com/blog/ida-9.5-release — IDA 9.5 release
- https://binary.ninja/2026/09/03/binary-ninja-6.0-krypton.html — BN 6.0 release
- https://www.pnfsoftware.com/jeb/changelog — JEB changelog
- https://github.com/radareorg/radare2/releases — radare2 releases
- https://github.com/rizinorg/cutter/releases — Cutter releases
- https://github.com/angr/angr — angr
- https://github.com/cea-sec/miasm — Miasm
- https://github.com/avast/retdec — RetDec (dead)
- https://github.com/uxmal/reko — Reko
- https://github.com/decompiler-explorer/decompiler-explorer — Decompiler Explorer
- https://dogbolt.org — Dogbolt live service
- https://github.com/Noelo-Lab/kuna — Kuna agent-first decompiler
- https://decbench.com — DecBench leaderboard

### Neural decompilation

- https://github.com/albertan017/LLM4Decompile — LLM4Decompile
- https://huggingface.co/LLM4Binary — LLM4Binary models and datasets
- https://github.com/LiuPeiP-CS/CodeInverter — CodeInverter
- https://github.com/AlexShypula/decaf — Decaf
- https://github.com/lt-asset/nova — Nova
- https://github.com/XingTuLab/recopilot — ReCopilot
- https://github.com/winmin/OpenReCopilot — OpenReCopilot IDA plugin
- https://reveng.ai — RevEng.AI Ventris and WilBERT
- https://arxiv.org/abs/2403.05286 — LLM4Decompile paper
- https://arxiv.org/abs/2505.12668 — Decompile-Bench paper
- https://arxiv.org/abs/2505.11340 — DecompileBench paper
- https://arxiv.org/abs/2606.16162 — AutoDecompiler paper
- https://arxiv.org/abs/2601.14598 — HELIOS paper
- https://arxiv.org/abs/2608.27981 — CHISEL paper
- https://www.ndss-symposium.org/ndss-paper/idioms-a-simple-and-effective-framework-for-turbo-charging-local-neural-decompilation-with-well-defined-types/ — IDIOMS paper

### Dynamic analysis

- https://github.com/frida/frida — Frida
- https://github.com/DynamoRIO/dynamorio — DynamoRIO
- https://www.intel.com/content/www/us/en/developer/articles/tool/pin-a-dynamic-binary-instrumentation-tool.html — Intel PIN
- https://github.com/QBDI/QBDI — QBDI
- https://github.com/unicorn-engine/unicorn — Unicorn
- https://github.com/qilingframework/qiling — Qiling
- https://github.com/JonathanSalwan/Triton — Triton
- https://github.com/quarkslab/tritondse — TritonDSE
- https://github.com/klee/klee — KLEE
- https://github.com/eurecom-s3/symcc — SymCC
- https://github.com/sydr-fuzz — Sydr
- https://github.com/AFLplusplus/AFLplusplus — AFL++
- https://github.com/google/oss-fuzz — OSS-Fuzz
- https://github.com/ossf/fuzz-introspector — Fuzz Introspector
- https://github.com/google/oss-fuzz-gen — OSS-Fuzz-Gen
- https://github.com/ossf/oss-crs — OSS-CRS

### Symbolic execution and SMT

- https://github.com/angr/angr — angr 10.x
- https://github.com/sandbornm/angr_mcp — angr-management MCP plugin
- https://github.com/Z3Prover/z3 — Z3
- https://github.com/bitwuzla/bitwuzla — Bitwuzla
- https://arxiv.org/abs/2608.06397 — Agolic
- https://arxiv.org/abs/2607.21676 — KLEECopilot
- https://arxiv.org/abs/2606.10264 — RECON
- https://arxiv.org/abs/2608.04217 — POVGEN
- https://arxiv.org/abs/2401.11108 — LLM4Fuzz

### Deobfuscation

- https://github.com/wul7chaos/vmp-reverse-skill — VMP reverse skill
- https://arxiv.org/abs/2603.18355 — PUSHAN paper
- https://github.com/NoAddr/yaps — yaps PUSHAN rebuild
- https://github.com/NaC-L/Mergen — Mergen lifter
- https://github.com/JonathanSalwan/VMProtect-devirtualization — VMP devirtualization
- https://github.com/can1357/NoVmp — NoVmp
- https://github.com/aftermathlabs/vmp2 — vmp2
- https://github.com/jz0/tvm-devirt — tvm-devirt
- https://github.com/bobalkkagi/bobalkkagi — Themida research
- https://github.com/chramiq/de4vmp — de4vmp
- https://github.com/Aetherx86/VMP_DEVIRT — VMP_DEVIRT
- https://github.com/cdong1012/ollvm-unflattener — OLLVM unflattener
- https://github.com/obpo-project/obpo-plugin — OLLVM-CFF plugin
- https://github.com/cq674350529/deflat — deflat
- https://github.com/XingTuLab/JSIMPLIFIER — JSimplifier
- https://github.com/j4k0xb/webcrack — webcrack
- https://github.com/relative/synchrony — synchrony
- https://github.com/ben-sb/javascript-deobfuscator — JS deobfuscator
- https://github.com/jehna/humanify — humanify
- https://github.com/defuscator/awesome-javascript-deobfuscation — JS deobf index
- https://github.com/Huai-Tian/Exuvia — Exuvia Android unpacking

### Protocol and format RE

- https://github.com/Moosa-Salehi/protocol_reverse_engineering — Protocol RE pipeline
- https://github.com/reverseame/MARISSA — MARISSA
- https://github.com/netzob/netzob — Netzob
- https://github.com/yapengye/NetPlier — NetPlier
- https://github.com/vs-uulm/nemesys — NEMESYS
- https://github.com/binaryinferno/binaryinferno — BinaryInferno
- https://luelista.github.io/pre_workbench — PRE Workbench
- https://nicolashedoire.github.io/substrat-landing — Substrat
- https://github.com/cy3erm/ProtoForge — ProtoForge
- https://github.com/KuiChi-x/reverseloom — Reverseloom
- https://github.com/NotYuSheng/TracePcap — TracePcap
- https://github.com/kylecui/NetForensicMCP — NetForensicMCP
- https://github.com/andsopwn/wireshark-mcp — wireshark-mcp
- https://github.com/AuroraAeon/010-editor-mcp — 010 Editor MCP
- https://kaitai.io — Kaitai Struct
- https://github.com/kaitai-io/kaitai_struct_formats — Kaitai format corpus
- https://ieeexplore.ieee.org/document/11229688 — MALPRE
- https://github.com/huoyuxi/ChatPRE — ChatPRE
- https://arxiv.org/abs/2610.31844 — SemPRE
- https://www.usenix.org/system/files/usenixsecurity26-ye.pdf — USENIX adversarial spec paper

### Matching decomp and recomp

- https://decomp.me — decomp.me
- https://github.com/decompme/decomp.me — decomp.me source
- https://github.com/encounter/objdiff — objdiff
- https://github.com/simonlindholm/asm-differ — asm-differ
- https://github.com/simonlindholm/decomp-permuter — decomp-permuter
- https://github.com/N64Recomp/N64Recomp — N64Recomp
- https://github.com/Zelda64Recomp/Zelda64Recomp — Zelda64Recomp
- https://github.com/zeldaret/oot — zeldaret OOT
- https://github.com/zeldaret/mm — zeldaret MM
- https://github.com/orgs/n64decomp/repositories — n64decomp org
- https://github.com/sm64pc/sm64ex — sm64ex
- https://github.com/pmret/papermario — papermario
- https://github.com/OpenCommunityEdition/OpenCE — OpenCE
- https://github.com/gta-reversed/gta-reversed — gta-reversed
- https://github.com/liolu/ds-decomp-studio — DS Decomp Studio
- https://github.com/maci0/rebrew — rebrew
- https://github.com/Muhtasham/decomp-goal-harness — decomp-goal-harness
- https://github.com/RetroReversing/decompdecomp — decompdecomp
- https://github.com/n64hub — n64hub AI recomps
- https://github.com/i12bp8/decomp.wtf — decomp.wtf (archived)
- https://github.com/ayrtondenner/ReverseApoc — ReverseApoc
- https://github.com/monteslu/romdev — romdev

### Console recomp

- https://github.com/RetroPortingToolKit/psxrecomp — PSXRecomp
- https://github.com/pcsx-redux/pcsx-redux — PCSX-Redux
- https://github.com/ran-j/PS2Recomp — PS2Recomp
- https://github.com/drakolordx7/nxrecomp — nxrecomp
- https://github.com/peiikai/LASRecomp — LASRecomp
- https://github.com/Revivedx/SavageWindRecomp — SavageWindRecomp
- https://github.com/bgyss/SwitchRecomp — SwitchRecomp spec
- https://github.com/kaiyao7/SwitchRecomp — SwitchRecomp framework
- https://github.com/hedge-dev/XenonRecomp — XenonRecomp
- https://github.com/hedge-dev/UnleashedRecomp — UnleashedRecomp
- https://1379.tech/i-built-a-ps1-static-recompiler-with-no-prior-experience-and-claude-code/ — Tomba case study
- https://retroportingtoolkit.com — RetroPortingToolKit
- https://recomp.fyi — recomp registry

### Firmware and embedded

- https://github.com/ReFirmLabs/binwalk — Binwalk v3
- https://github.com/onekey-sec/unblob — unblob
- https://github.com/nmatt0/moria — moria
- https://github.com/fkie-cad/FACT_core — FACT
- https://github.com/e-m-b-a/emba — EMBA
- https://github.com/pr0v3rbs/FirmAE — FirmAE
- https://github.com/firmadyne/firmadyne — Firmadyne
- https://github.com/marin-m/vmlinux-to-elf — vmlinux-to-elf
- https://github.com/al3xtjames/ghidra-firmware-utils — Ghidra firmware utils
- https://arxiv.org/abs/2511.18438 — FIRMHIVE
- https://github.com/vul337/FirmAgent — FirmAgent
- https://github.com/zhang-xr/FirmLLM — FirmLLM
- https://github.com/DavidClawson/ripcord — ripcord
- https://github.com/DatanoiseTV/revenant — revenant
- https://github.com/2389-research/binary-re — binary-re
- https://github.com/okhsunrog/flashprobe-mcp — flashprobe-mcp
- https://github.com/Klievan/jlink-mcp — jlink-mcp
- https://github.com/eliboa/TegraRcmGUI — TegraRcmGUI
- https://github.com/DavidBuchanan314/fusee-nano — fusee-nano
- https://github.com/Adubbz/Ghidra-Switch-Loader — Ghidra Switch Loader

### Mobile RE

- https://github.com/zinja-coder/jadx-ai-mcp — jadx-ai-mcp
- https://github.com/zinja-coder/jadx-mcp-server — jadx-mcp-server
- https://github.com/zinja-coder/apktool-mcp-server — apktool-mcp-server
- https://github.com/1013503897/jadx-headless-mcp — jadx-headless-mcp
- https://github.com/samudoria/revoid — revoid
- https://github.com/xjoker/delamain — delamain
- https://github.com/asLody/dexdec — dexdec
- https://github.com/APKLab/APKLab — APKLab
- https://github.com/mobilehackinglab/jadx-mcp-plugin — jadx-mcp-plugin
- https://github.com/flankerhqd/jebmcp — jebmcp
- https://github.com/FuzzySecurity/kahlo-mcp — kahlo-mcp
- https://github.com/ZSA233/frida-analykit — frida-analykit
- https://github.com/PhoenixHairpin/mcp-termux — mcp-termux
- https://github.com/SimoneAvogadro/android-reverse-engineering-skill — Android RE skill
- https://github.com/index-login/MobileRE-Skill — MobileRE-Skill
- https://github.com/Fausto-404/ai-mobile-reverse-skills — ai-mobile-reverse-skills
- https://github.com/incogbyte/iOS-reverse-engineering-claude-skill — iOS RE skill
- https://github.com/Cassian433/ioskit — ioskit
- https://github.com/sensepost/objection — Objection

### Managed code

- https://github.com/icsharpcode/ILSpy — ILSpy
- https://github.com/dnSpyEx-Project/dnSpy — dnSpyEx
- https://jetbrains.com/decompiler — dotPeek
- https://github.com/0xd4d/dnlib — dnlib
- https://github.com/Vineflower/vineflower — Vineflower
- https://github.com/leibnitz27/cfr — CFR
- https://github.com/mstrobel/procyon — Procyon
- https://github.com/skylot/jadx — jadx
- https://github.com/mandiant/GoReSym — GoReSym
- https://github.com/goretk/gore — gore
- https://github.com/goretk/redress — redress
- https://github.com/cyberark/ByteCodeLLM — ByteCodeLLM

### Malware analysis

- https://ai.virustotal.com — VirusTotal AI
- https://github.com/mandiant/xrefer — XRefer
- https://github.com/microsoft/project-ire — Project Ire
- https://www.microsoft.com/en-us/research/blog/project-ire-autonomously-identifies-malware-at-scale/ — Project Ire blog
- https://www.sentinelone.com/labs/building-an-adversarial-consensus-engine-multi-agent-llms-for-automated-malware-analysis/ — SentinelOne consensus engine
- https://any.run — ANY.RUN
- https://www.joesecurity.org/joe-reverser — Joe Reverser
- https://zerolabs.rubrik.com — Rubrik AMAS
- https://malwarebench.com — MalwareBench
- https://github.com/arimlabs/malware-bench — MalwareBench repo
- https://github.com/robomotic/AgentRE-Bench — AgentRE-Bench
- https://github.com/ZhengXR930/MalEval — MalEval
- https://github.com/CrowdStrike/CyberSOCEval_data — CyberSOCEval data
- https://github.com/bikasaha/MaLAware — MaLAware
- https://github.com/allsmog/revgraph — RevGraph
- https://github.com/CSIT-SG/AETHER — AETHER
- https://github.com/malwarecakefactory/IDA_Malware_MCP_Server — IDA Malware MCP

### Benchmarks

- https://retrobench.ai — Retrobench
- https://decbench.com — DecBench
- https://quesma.com/benchmarks/binaryaudit — BinaryAudit
- https://daplab.cs.columbia.edu/benchmarks/sre-bench — SRE-Bench
- https://arxiv.org/abs/2608.11469 — SRE-Bench paper
- https://www.agentre-bench.ai — AgentRE-Bench
- https://github.com/agentrebench/AgentRE-Bench — AgentRE-Bench repo
- https://arxiv.org/abs/2605.10597 — CrackMeBench paper
- https://malwarebench.com — MalwareBench
- https://github.com/CLAY-JYB/BIOPSY-Bench — BIOPSY-Bench
- https://github.com/crackmesone/crackmes-re-dataset — crackmes-RE dataset
- https://nyu-llm-ctf.github.io — NYU CTF Bench
- https://cybench.github.io — Cybench
- https://intercode-benchmark.github.io — InterCode-CTF
- https://hwrebench.com — HWREBench
- https://arxiv.org/abs/2505.07360 — BinMetric
- https://arxiv.org/abs/2604.27319 — REBench
- https://arxiv.org/abs/2607.07738 — REFORGE
- https://arxiv.org/abs/2604.03750 — CREBench
- https://arxiv.org/abs/2610.37871 — ICall-Bench
- https://arxiv.org/abs/2609.01185 — Reveree
- https://arxiv.org/abs/2610.28212 — ExeBench-FHD
- https://arxiv.org/abs/2608.11469 — SRE-Bench
- https://arxiv.org/abs/2610.14960 — Humans vs Machines
- https://arxiv.org/abs/2606.17398 — SoK AI-Augmented Binary Reversing
- https://arxiv.org/abs/2604.14317 — Challenges in Agentic RE
- https://arxiv.org/abs/2509.21821 — LLMs for RE survey

### Models

- https://llmgateway.io/models/reverse-engineering — Model pricing comparison
- https://huggingface.co/LLM4Binary — LLM4Binary models
- https://huggingface.co/AutoDecompiler — AutoDecompiler models
- https://huggingface.co/BlazingCustoms/pybytecode-v3-1.5b — PyBytecode
- https://huggingface.co/raafatabualazm — Community decompiler fine-tunes
- https://github.com/lt-asset/nova — Nova
- https://github.com/XingTuLab/recopilot — ReCopilot
- https://github.com/JusticeRage/Gepetto — Gepetto
- https://github.com/weirdmachine64/GhidraGPT — GhidraGPT
- https://mahaloz.re — DAILA
- https://github.com/mrphrazer/reverser_ai — ReverserAI
- https://github.com/cyberark/ByteCodeLLM — ByteCodeLLM

### Cost and context

- https://github.com/moyix/gpt-wpre — GPT-WPRE
- https://github.com/llnl/OGhidra — OGhidra
- https://github.com/lesterppo/hermes-rea-cli — hermes-rea-cli
- https://github.com/SentineLabs/verified-ida — VerifiedIDA
- https://github.com/akiselev/ghidra-cli — ghidra-cli
- https://github.com/radareorg/r2ai — r2ai
- https://github.com/evyatar9/GptHidra — GptHidra
- https://github.com/likvidera/GhidraChatGPT — GhidraChatGPT
- https://github.com/JusticeRage/Gepetto — Gepetto
- https://www.sentinelone.com/labs/frontier-models-tackle-autonomous-long-horizon-malware-analysis/ — SentinelLABS Sol Searching
- https://arxiv.org/abs/2608.11469 — SRE-Bench cost data

### Isolation and security

- https://github.com/REMnux/remnux-mcp-server — REMnux MCP
- https://docs.remnux.org/tips/using-ai.md — REMnux AI docs
- https://github.com/CAPESandbox/CAPEsolo — CAPEsolo
- https://github.com/CAPESandbox/CAPE-mcp — CAPE-mcp
- https://github.com/kevoreilly/CAPEv2 — CAPEv2
- https://github.com/CAPESandbox/CAPEvm — CAPEvm
- https://github.com/mandiant/flare-vm — FLARE-VM
- https://remnux.org — REMnux
- https://any.run — ANY.RUN
- https://www.joesandbox.com — Joe Sandbox
- https://hybrid-analysis.com — Falcon Sandbox
- https://panel.idainstances.xyz — ida-instances
- https://github.com/google/gvisor — gVisor
- https://github.com/kata-containers/kata-containers — Kata Containers
- https://github.com/firecracker-microvm/firecracker — Firecracker
- https://qemu.org — QEMU
- https://github.com/google/nsjail — nsjail
- https://github.com/e2b-dev/runtime — E2B Runtime
- https://github.com/getagentseal/agentseal — AgentSeal
- https://github.com/DaoyuanLi2816/mcp-fence — mcp-fence
- https://mcpjail.com — mcpjail
- https://github.com/docker/mcp-gateway — Docker MCP Gateway
- https://github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall — LlamaFirewall
- https://docs.litellm.ai/docs/proxy/guardrails — LiteLLM guardrails
- https://arxiv.org/abs/2606.19235 — CodeSentinel
- https://github.com/anthropic-experimental/sandbox-runtime — Anthropic sandbox-runtime
- https://github.com/mrphrazer/ghidra-headless-mcp — ghidra-headless-mcp security notes
- https://github.com/LaurieWired/GhidraMCP/issues/140 — GhidraMCP injection issue
- https://github.com/LaurieWired/GhidraMCP/issues/141 — GhidraMCP audit issue
- https://blog.trailofbits.com/2025/04/21/jumping-the-line-how-mcp-servers-can-attack-you-before-you-ever-use-them/ — Tool poisoning
- https://invariantlabs.ai/blog/mcp-security-notification-tool-poisoning-attacks — Tool poisoning original
- https://developer.microsoft.com/blog/protecting-against-indirect-injection-attacks-mcp/ — Rug pull
- https://research.checkpoint.com/2025/ai-evasion-prompt-injection/ — Skynet sample
- https://www.sentinelone.com/labs/macos-gaslight-rust-backdoor-turns-prompt-injection-on-the-analyst-not-the-sandbox/ — macOS.Gaslight
- https://blog.talosintelligence.com/ignore-all-instructions-and-read-this-blog-the-state-of-ai-analysis-evasion-in-malware/ — CAIRN A3
- https://github.com/Cisco-Talos/CAIRN — CAIRN framework
- https://socket.dev/blog/sandworm-mode-npm-worm-ai-toolchain-poisoning — Shai-Hulud worm
- https://github.com/NationalSecurityAgency/ghidra/security/advisories/GHSA-mc3p-mq2p-xw6v — Ghidra CFStrings RCE
- https://arxiv.org/abs/2605.30667 — RE AI agent attacks
- https://arxiv.org/html/2605.30677 — Injection detection and obfuscation
- https://arxiv.org/html/2607.12507 — RARE representation confusion
- https://arxiv.org/html/2609.19722 — ALIBI semantic reframing
- https://arxiv.org/abs/2508.21669 — Cybersecurity AI prompt injection
- https://owasp.github.io/DevSecOpsGuideline/2-Process/2-2-Develop/2-2-5-AI-Agent-and-MCP-Security/ — OWASP AI Agent and MCP Security
- https://cheatsheetseries.owasp.org/cheatsheets/MCP_Security_Cheat_Sheet.html — OWASP MCP Security Cheat Sheet
- https://genai.owasp.org/2025/12/09/owasp-top-10-for-agentic-applications-the-benchmark-for-agentic-security-in-the-age-of-autonomous-ai/ — OWASP Top 10 for Agentic Applications
- https://atlas.mitre.org — MITRE ATLAS
- https://modelcontextprotocol.io/specification/2025-11-25/basic/security_best_practices — MCP security best practices

### Cloud infrastructure

- https://panel.idainstances.xyz — ida-instances
- https://github.com/sanchomuzax/codespace-x86-re-toolkit — codespace-x86-re-toolkit
- https://github.com/clearbluejar/ghidra-python-vscode-devcontainer-skeleton — Ghidra devcontainer
- https://github.com/cyberkaida/ghidra-devcontainer — Ghidra devcontainer minimal
- https://github.com/alexmi256/rea-agent-docker — REA agent Docker
- https://github.com/dagoSte/rea-safe-agents — REA safe agents
- https://github.com/dagoSte/reverseai — ReverseAI sandbox
- https://github.com/clearbluejar/ghidriff — ghidriff
- https://github.com/AmerMrkaljevic/patchdiff — patchdiff
- https://github.com/er28-0652/setup-ghidra — setup-ghidra action
- https://github.com/Cisco-Talos/Ghidraaas — Ghidraaas
- https://www.ghidra-server.org — ghidra-server.org

### Skills

- https://github.com/agentskills/agentskills — Agent Skills specification
- https://agentskills.io — Agent Skills site
- https://skills.sh — skills.sh registry
- https://github.com/zhaoxuya520/reverse-skill — reverse-skill
- https://github.com/dslsdzc/rev-skills — rev-skills
- https://github.com/manyuegong33/r0crawl_skills — r0crawl_skills
- https://github.com/batteryshark/rekit — rekit
- https://github.com/mukul975/Anthropic-Cybersecurity-Skills — Cybersecurity skills
- https://github.com/ljagiello/ctf-skills — ctf-skills
- https://github.com/wshobson/agents — wshobson agents
- https://github.com/0xeb/ghidrasql-skills — ghidrasql-skills
- https://github.com/Cristallin2006/ghidra-skill-for-dsh — ghidra-skill-for-dsh
- https://github.com/ByteLandTechnology/headless-ghidra — headless-ghidra skills
- https://github.com/Newmcpe/ida-reverse-engineering-skill — IDA RE skill
- https://github.com/haikow/claude-reverse-skills — claude-reverse-skills
- https://github.com/P4nda0s/reverse-skills — P4nda0s reverse-skills
- https://github.com/dariushoule/x64dbg-skills — x64dbg-skills
- https://github.com/SimoneAvogadro/android-reverse-engineering-skill — Android RE skill
- https://github.com/index-login/MobileRE-Skill — MobileRE-Skill
- https://github.com/Fausto-404/ai-mobile-reverse-skills — ai-mobile-reverse-skills
- https://github.com/incogbyte/iOS-reverse-engineering-claude-skill — iOS RE skill
- https://github.com/gl0bal01/malware-analysis-claude-skills — malware analysis skills
- https://github.com/schlarpc/re-shell — re-shell
- https://github.com/unknowbug/RE-Framework — RE-Framework
- https://github.com/2233admin/reverse-skill-evolver — reverse-skill-evolver

### Verification

- https://github.com/2akouwu/reverify — reverify
- https://github.com/encounter/objdiff — objdiff
- https://decomp.me — decomp.me
- https://github.com/maci0/rebrew — rebrew
- https://github.com/GeneralAtrox/DecompPipeline — DecompPipeline
- https://github.com/Yharnam-Hunters/Paleblood — Paleblood
- https://github.com/SentineLabs/verified-ida — VerifiedIDA
- https://github.com/shouvikkkk/re-ground — re-ground
- https://github.com/akiselev/ghidra-cli — ghidra-cli

### Learning

- https://beginners.re — RE4B
- https://pwn.college — pwn.college
- https://github.com/RPISEC/MBE — RPISEC MBE
- https://malwareunicorn.org — Malware Unicorn
- https://www.openanalysis.net — OALABS
- https://recon.cx/2026/en/training.html — REcon 2026 trainings
- https://recon.cx/2026/en/trainingAutomatingREwithAIML.html — REcon AI/ML course
- https://recon.cx/2026/en/trainingBuildingAgenticRE.html — REcon Agentic RE course
- https://fuzzinglabs.com/ringzer0-2025-applied-ai-llm-for-android-apk-reversing-and-analysis/ — FuzzingLabs APK course
- https://www.udemy.com/course/ai-mcp-reverse-engineering/ — Udemy MCP course
- https://trainsec.net/courses/malware-analysis-and-development/ — TrainSec
- https://www.reddit.com/r/ReverseEngineering — r/ReverseEngineering
- https://www.reddit.com/r/Malware — r/Malware
- https://discord.gg/oalabs — OALABS Discord

### Indexes

- https://github.com/reacher-z/Awesome-REA — Awesome-REA
- https://awesomerea.org — Awesome-REA site
- https://github.com/ReversingID/Awesome-Reversing — Awesome-Reversing
- https://github.com/morluto/awesome-reverse-engineering — morluto awesome RE
- https://github.com/wtsxDev/reverse-engineering — wtsxDev awesome RE
- https://github.com/ZX41R/awesome-reverse-engineering-and-malware-analysis — ZX41R
- https://edwardtay.github.io/awesome-reverse-engineering/ — edwardtay
- https://decompilation.wiki — decompilation wiki
- https://github.com/zhuyansen/awesome-ai-reverse-engineering — zhuyansen AI RE
- https://agentskillshub.top/best/ai-reverse-engineering/ — agentskillshub live
- https://github.com/DiscoverBox/awesome-ai-reverse-engineering — DiscoverBox
- https://github.com/ram-elgov/awesome-llm-reverse-engineering — ram-elgov
- https://github.com/AIshihzong/awesome-reverse-engineer-anything — AIshihzong
- https://github.com/yibie/awesome-rea — yibie awesome REA
- https://github.com/crowdere/Awesome-RE-MCP — Awesome-RE-MCP
- https://github.com/nforest/awesome-decompilation — nforest decompilation
- https://github.com/suxnju/awesome-ai-for-software-reverse-engineering — suxnju
- https://malpedia.caad.fkie.fraunhofer.de — Malpedia
- https://github.com/rshipp/awesome-malware-analysis — awesome-malware-analysis
- https://github.com/pedramamini/awesome-yara — awesome-yara
- https://github.com/vxunderground/MalwareSourceCode — MalwareSourceCode
- https://crackmes.one — crackmes.one
- https://ctftime.org/ctfs — CTFtime
- https://github.com/sajjadium/ctf-archives — ctf-archives
- https://flare-on.com — FLARE ON
- https://challenges.re — challenges.re
- https://plugins.hex-rays.com — Hex-Rays plugins
- https://github.com/Vector35/community-plugins — BN plugins
- https://github.com/onethawt/idaplugins-list — IDA plugins list
- https://github.com/ghidraninja/ghidra_scripts — Ghidra scripts
- https://github.com/grayhatacademy/ghidra_scripts — Ghidra scripts academy
- https://skills.sh — skills.sh
- https://agentskills.io — agentskills.io
- https://github.com/degrigis/awesome-angr — awesome-angr
- https://github.com/hexsecs/awesome-embedded-security — awesome-embedded-security
- https://github.com/SubmitGame/awesome-decomp-games — awesome-decomp-games
- https://github.com/heaven-hm/awesome-reverse-engineered-games — awesome-reverse-engineered-games
- https://recomp.fyi — recomp.fyi
- https://retroportingtoolkit.com — RetroPortingToolKit

### Commercial and research

- https://projectzero.google/2024/10/from-naptime-to-big-sleep.html — Big Sleep
- https://blog.google/innovation-and-ai/technology/safety-security/cybersecurity-updates-summer-2025/ — Google AI security summer 2025
- https://www.darpa.mil/news/2025/aixcc-results — AIxCC results
- https://github.com/AIxCyberChallenge — AIxCC org
- https://archive.aicyberchallenge.com — AIxCC archive
- https://github.com/trailofbits/buttercup — Buttercup CRS
- https://github.com/Team-Atlanta/aixcc-afc-atlantis — Atlantis CRS
- https://github.com/theori-io/aixcc-afc-archive — Theori archive
- https://github.com/42-b3yond-6ug/42-b3yond-6ug-crs — BugBuster CRS
- https://sidekick.binary.ninja — Sidekick
- https://www.binarly.io — Binarly
- https://docs.binarly.io — Binarly docs
- https://www.claroty.com/claire — Claroty Claire
- https://www.claroty.com/team82/research/hands-free-what-llm-driven-vulnerability-research-looks-like — Team82 LLM RE
- https://runsafesecurity.com — RunSafe
- https://intezer.com — Intezer
- https://www.reversinglabs.com — ReversingLabs
- https://learn.microsoft.com/en-us/security/agentic-security/agentic-security-application-card — Project Perception
- https://learn.microsoft.com/en-us/defender-xdr/copilot-in-defender-file-analysis — Copilot file analysis
- https://github.com/faizann24/baby-naptime — baby-naptime

---

## 20. Final Assessment

### 20.1 What changed in 2026

- MCP became the standard interface between LLMs and RE tools. Every major tool has at least one server.
- Commercial tools shipped official MCP servers: Hex-Rays IDA MCP, Binary Ninja native MCP, JEB MCP.
- Agent skills became the standard packaging for RE workflows.
- Verification architectures matured: evidence records, claim checking, compile-and-diff, execute-and-compare.
- Benchmarks caught up: SRE-Bench, DecBench, Retrobench, AgentRE-Bench, MalwareBench.
- The community split on AI: some projects ban AI contributions, others embrace them openly.
- Prompt injection from binaries became a documented threat with named malware families.

### 20.2 What did not change

- Experts still outperform AI on hard targets.
- AI still hallucinates on open-ended questions.
- Real malware RE remains unsolved for agents.
- The best workflow still requires a human who knows what correct looks like.

### 20.3 The one-paragraph version

In 2026, the best AI-assisted RE setup is: a coding-agent harness (Claude Code or Codex CLI) plus an MCP server for your analysis tool (official Hex-Rays ida-mcp for IDA, bethington or LaurieWired ghidra-mcp for Ghidra, native MCP for Binary Ninja) plus a skill pack for your domain plus a deterministic verification gate plus an isolated environment for untrusted binaries. Use frontier models for interactive work, specialist decompilation models for bulk function-level work, and local open models for air-gapped work. Verify everything. The AI proposes. The tools and the human decide.

---

*End of report. Research date: 2026-11-05. 32 research agents. All sources cited inline.*
