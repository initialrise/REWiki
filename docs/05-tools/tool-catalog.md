# RE Tool Catalog for the AI Era

> Tags: tools, mcp, decompilers, debuggers, triage | Difficulty: intermediate | Prerequisites: basic reverse engineering, an MCP-capable agent client

## Overview

This page catalogs the tools that pair well with AI agents in 2026. It groups them by role. For each tool it lists the AI interface status, headless capability, and license or cost. It ends with a selection guide by target type.

Facts marked "reported" or "claimed" come from vendor pages or community sources. Facts without a mark were checked against primary sources during research on 2026-11-05.

The single rule: an agent is only as good as the tools it can reach. A decompiler without an MCP server or a scriptable CLI forces the agent to work through screenshots and copy-paste. Prefer tools with a first-party or mature community MCP bridge.

## Setup

Install one decompiler MCP first. Add debugger and triage MCP servers only after the decompiler loop works.

### Recommended MCP bridges by decompiler

| Decompiler | MCP server | Install | Notes |
|---|---|---|---|
| IDA Pro 9.5 | Official Hex-Rays IDA MCP (github.com/HexRaysSA/ida-mcp) | `uvx ida-hcli mcp install` | Requires IDA 9.4+ with idalib and Python 3.11+. "Code mode": the agent writes IDAPython instead of calling many small tools |
| IDA Pro | mrexodia/ida-pro-mcp | `pip install ida-pro-mcp` then `ida-pro-mcp --install` | Community server. About 50 tools. Headless `idalib-mcp` worker model |
| Ghidra 12.2 | LaurieWired/GhidraMCP (github.com/LaurieWired/GhidraMCP) | `uvx --from git+https://github.com/LaurieWired/GhidraMCP ghidra-mcp` | Apache-2.0. v2.0 adds `--headless` PyGhidra mode |
| Ghidra 12.2 | bethington/ghidra-mcp | `uv tool install` after installing the Ghidra extension | 219 tools. GUI plugin plus headless. Most complete bridge |
| Ghidra | cyberkaida/reverse-engineering-assistant (ReVa) | `pip install reverse-engineering-assistant` | Small tool surface. Designed against hallucination |
| Binary Ninja 6.0 | Native server | Enable in the app | GUI server at `http://127.0.0.1:24642/mcp` with bearer token. Headless `binaryninja_mcp` for Commercial/Ultimate editions on macOS and Linux |
| radare2 6.2.4 | radareorg/radare2-mcp | Package or build from source | Official r2 MCP. Stdio plus r2 core plugin HTTP. Readonly and sandbox modes |
| JEB Pro 5.48 | First-party MCP server | Bundled with JEB | Changelog shows active tool additions through 5.48 (2026-10-07) |
| Hopper | Integrated MCP server | Bundled | Vendor page advertises "AI capabilities through an integrated MCP server" |
| angr 10.x | Built-in MCP | `pip install "angr[llm]"` then `angr-mcp` | Only symbolic engine with a first-party agent interface |

### Multi-tool MCP suites

When you need many tools behind one interface, use a suite instead of separate servers:

| Server | URL | Coverage |
|---|---|---|
| REA (Reverse Engineer Anything) | github.com/morluto/rea | Ghidra, IDA, Hopper, Kuna, JADX, Frida, x64dbg, Rizin, pcap, WASM |
| Reversecore_MCP | github.com/sjkim1127/Reversecore_MCP | 179 tools over radare2, r2ghidra, LIEF, Capstone, YARA, angr, DIE, capa, FLOSS, binwalk, Volatility3, Scapy |
| minusOne-mcp-reverse | github.com/Ashibalt/minusOne-mcp-reverse | 77 semantic operations. Dockerized static backends with `--network none` |
| Arkana | github.com/lazyhackerone/arkana | About 250-289 tools including angr, YARA, capa, FLOSS, Binary Refinery, Qiling |

## How It Works

Each tool below is listed with four fields:

- **AI interface**: MCP server, plugin, CLI, or none.
- **Headless**: can the tool run without a GUI.
- **License/cost**: what you pay and under what terms.
- **Pick it for**: the target types where it is the best choice.

### Decompilers and disassemblers

| Tool | Version (2026-11) | AI interface | Headless | License/cost | Pick it for |
|---|---|---|---|---|---|
| Ghidra | 12.2 (October 2026) | Many MCP servers. PyGhidra headless mode | Yes, `analyzeHeadless` and PyGhidra | Apache-2.0, free | Default choice for free work. Firmware, unknown formats, headless farms |
| IDA Pro | 9.5 (October 2026) | Official Hex-Rays MCP. mrexodia/ida-pro-mcp. Blacktop Rust MCP | Yes, idalib workers | Commercial license | Professional malware and closed-source work. Best decompiler quality per reports |
| Binary Ninja | 6.0 Krypton (September 2026) | Native MCP in all editions. Sidekick AI layer | Headless `binaryninja_mcp` needs Commercial/Ultimate | Commercial editions plus free edition | Modern HLIL/MLIL/LLIL IR. Sidekick gives an agentic layer with validation |
| JEB Pro | 5.48 (October 2026) | First-party MCP server. VIBRE AI assistant | Reported; verify before relying on it | Commercial | Android and Dalvik heavy work. Dex decompilation and APK unpacking |
| radare2 | 6.2.4 | r2mcp official. r2ai plugin. Official skill pack | Yes, fully scriptable | LGPLv3 | CLI-first workflows, CTF, remote targets, r2pipe automation |
| rizin / Cutter | 0.9.1 / 2.5.0 | r2mcp works on the core | Yes | LGPL | Fork of radare2 with focus on usability. Cutter GUI has no mature AI integration |
| Hopper | Latest with integrated MCP (version unverified) | Integrated MCP server | Python scripting. Headless mode reported | Commercial, cheaper than IDA. macOS only | macOS and iOS Mach-O work. Objective-C and Swift decoding |
| RetDec | v5.0 (2022) | None | Yes | Apache-2.0 | Do not pick. Effectively dead. Report recommends avoiding it for new work |
| angr | 10.0.5 | Built-in MCP | Yes | BSD-style | Symbolic execution, CFG recovery, constraint solving |
| Miasm | Active | None, Python API | Yes | GPLv2 | Custom symbolic pipelines when you need full control |
| Reko | 0.12.x | None | Yes | Apache-2.0 | Niche open-source decompiler. Backup when Ghidra fails |

Version and status notes:

- IDA 9.5 added three decompilers (Android Dalvik, Infineon TriCore, Qualcomm Hexagon), bitfield recovery, AVX/SSE-to-C lifting, and recursive decompilation. Source: hex-rays.com/blog/ida-9.5-release.
- Binary Ninja 6.0 refactored calling conventions and roughly doubled analysis speed. Source: binary.ninja/2026/09/03/binary-ninja-6.0-krypton.html.
- Ghidra 12.2 added timeless debugging (beta), structure/union/enum merger, and Hexagon plus CIP-51 processors.
- Ghidra built-in Rust demangling exists since version 11. The old GhidRust plugin is obsolete.

### Debuggers

| Tool | AI interface | Headless | License/cost | Pick it for |
|---|---|---|---|---|
| x64dbg | duty1g/x64dbg-mcp-server (native Zig plugin, HTTP, about 2,800 stars). Two community alternatives exist | Plugin runs inside the GUI. Scriptable via x64dbg commands | GPLv3 | Windows user-mode PE debugging. The default Windows debugger MCP |
| WinDbg / WinDbgX | mnemonic-re/WinDbgX-MCP (pre-1.0, prompt-injection hardened) | KDNET kernel debugging supported | Free with Windows SDK | Kernel drivers, crash dumps, Windows internals |
| gdb + gef | No first-party MCP. Drive through shell or agent scripts | Yes | GPLv3 | Linux ELF debugging. gef adds heap, ROP, and pwndbg-style views |
| lldb | No mature MCP found. Used by Hopper and JEB as backend | Yes | Apache-2.0 with LLVM | macOS and iOS debugging. LLDB is the only practical iOS debugger path |
| Frida | kahlo-mcp (session lifecycle, most serious). dnakov/frida-mcp (stdio, about 460 stars). s4dp4nd4/frida-c2-mcp (on-device Android and iOS) | Yes, frida-server plus script | wxWindows licence | Cross-platform instrumentation. Mobile, anti-debug bypass, API hooking |

Debugger notes:

- For gdb and lldb there is no equivalent of x64dbg-mcp. Use them through the agent's shell tool or write your own MCP wrapper. Reported community wrappers exist but are immature.
- Frida MCP servers let the agent attach, spawn, and run JavaScript hooks. Treat every Frida script as executable code. Run it in a sandbox.
- x64dbg has three MCP plugins. duty1g/x64dbg-mcp-server is the most-starred. Verify which one your client config points to.

### Dynamic analysis and emulation frameworks

These are libraries the agent scripts against, not interactive debuggers.

| Tool | What it does | AI interface | Headless | License/cost | Pick it for |
|---|---|---|---|---|---|
| QBDI | LLVM-based dynamic binary instrumentation. Python and Frida bindings | Agent-scriptable through Python | Yes | Apache-2.0 | Instruction-level tracing on Windows, Linux, macOS, Android |
| DynamoRIO | C++ DBI platform with instruction-level IR | Not LLM-native. Powers Sydr DSE | Yes | BSD-style | Heavyweight tracing. Basis of Sydr symbolic execution |
| Intel PIN | x86/x64 DBI with Pintool C++ API | No active LLM ecosystem | Yes | Free, Intel licence | x86-only tracing when you already know Pintools |
| Unicorn | Multi-architecture CPU emulator | Python bindings. AFL++ unicorn mode | Yes | GPLv2 | Fast function-level emulation. Verification oracle for decomp output |
| Qiling | Full user-mode OS emulation (ELF, PE, Mach-O, Android, UEFI) | Python framework. GDB stub | Yes | GPLv2 | Emulate a whole binary without an OS. Rootfs snapshots supported |
| Triton | Concolic execution, taint, SMT | Backend for deobfuscation tools | Yes | Apache-2.0 | VMProtect-style devirtualization inputs |

Selection guidance:

- Use Unicorn or Qiling as an execution oracle. The agent writes a decompilation hypothesis, emulates it, and compares behavior to the original.
- Use QBDI when you need instruction-level visibility without full emulation.
- Use Frida for live processes. Use Qiling for offline emulation of suspicious or packed binaries.
- Intel PIN is x86-only. Prefer QBDI or DynamoRIO for new work.

### Triage and identification tools

These produce structured output that agents consume well. They are usually called through CLI, not MCP, though several appear inside multi-tool MCP suites.

| Tool | What it does | AI interface | Headless | License/cost | Pick it for |
|---|---|---|---|---|---|
| capa | Capability detection. Maps behavior to MITRE ATT&CK-style capabilities | CLI plus Ghidra and IDA plugins | Yes | Apache-2.0 | First-pass triage. "What does this binary do" before deep RE |
| FLOSS | Extracts obfuscated strings, decodes stack strings, reconstructs command lines | CLI plus IDA plugin | Yes | Apache-2.0 | Packed or obfuscated malware. Pair with capa |
| Detect It Easy (DIE) | File type, compiler, packer identification | CLI. Wrapped by Reversecore_MCP | Yes | MIT | Instant "what am I looking at". Run it before anything else |
| YARA | Pattern matching over files and memory | CLI. `yarascan` is a binary-scan wrapper. Wrapped by multiple MCP suites | Yes | BSD-style | Hunting, family attribution, IOC extraction |
| binwalk | Firmware and archive extraction | CLI | Yes | MIT | Firmware unpacking first stage |
| LIEF | Parse and modify ELF, PE, Mach-O, OAT, DEX, ART | Python library. Wrapped by Reversecore_MCP | Yes | Apache-2.0 | Programmatic header and import manipulation |

Triage workflow for agents:

1. Run DIE for identification.
2. Run capa and FLOSS for capabilities and strings.
3. Feed the JSON or text output into the agent as context.
4. Only then open the decompiler MCP.

This order saves tokens. capa output is small and high-signal. Decompiler output is large and noisy.

### Format and structure tools

| Tool | What it does | AI interface | Headless | License/cost | Pick it for |
|---|---|---|---|---|---|
| Kaitai Struct | Declarative binary format language (.ksy). Compiles to parsers in 12 languages | LLM generates .ksy specs. Visualizer for debugging | Yes, `ksc` compiler CLI | Compiler GPLv3+. Runtimes MIT/Apache | Unknown file formats, protocols, CTF structures |
| ImHex | Hex editor with pattern language, data inspector, data processor | No MCP found. Pattern language is LLM-writable | Yes, CLI exists | GPLv3. Free | Manual structure inspection, pattern prototyping |
| 010 Editor | Commercial hex editor with .bt templates | 010-editor-mcp (github.com/AuroraAeon/010-editor-mcp) connects LLM to live buffer | No | Commercial | When you need the MCP bridge for template work |
| PRE Workbench | Interactive hex plus grammar workbench. Lua dissector codegen | LLM writes the grammar DSL | Yes | Free | Protocol reverse engineering |

Kaitai workflow with an agent:

1. Give the agent a hex dump and a description of the observed structure.
2. Ask for a `.ksy` file.
3. Compile with `ksc`.
4. Run the generated parser against samples.
5. Iterate on parse errors. The visualizer shows which field fails.

Kaitai Struct compiler stable version is 0.11. Source: kaitai.io. The format corpus is at github.com/kaitai-io/kaitai_struct_formats.

ImHex is actively maintained. Nightly builds ship frequently. The pattern language supports user-defined literals and semantic syntax highlighting as of late-2026 nightlies. Source: github.com/WerWolv/ImHex releases.

## Step-by-Step

### Pick the right stack for your target

| Target type | Decompiler | Debugger | Dynamic | Triage first |
|---|---|---|---|---|
| Windows PE malware | IDA Pro or Ghidra | x64dbg | Frida, Qiling | DIE, capa, FLOSS |
| Linux ELF | Ghidra or IDA | gdb + gef | QBDI, Unicorn, Qiling | DIE, capa, FLOSS |
| macOS / iOS Mach-O | Hopper or IDA | lldb | Frida | DIE |
| Android APK | JEB or jadx + Ghidra | adb + Frida | QBDI | apktool, jadx |
| Firmware blob | Ghidra | QEMU or Renode | Qiling | binwalk, DIE |
| Game console binary | Ghidra or Binary Ninja | Console-specific | Unicorn as oracle | DIE |
| Unknown format / protocol | Kaitai + ImHex | N/A | N/A | Hex inspection |
| .NET assembly | dnSpyEx or ILSpy | dnSpyEx debugger | .NET profiling | de4dot if obfuscated |
| Go / Rust binary | Ghidra with demanglers | gdb / lldb | Qiling | GoReSym for Go symbols |

### Minimal viable setup

1. Install Ghidra 12.2 and one MCP server. LaurieWired/GhidraMCP is the most-starred. bethington/ghidra-mcp has the most tools.
2. Install capa, FLOSS, and DIE. They are pip or standalone binaries.
3. Install x64dbg with duty1g/x64dbg-mcp-server if you do Windows work.
4. Install Frida and one frida-mcp server for mobile or cross-platform hooking.
5. Add the MCP servers to your agent client config.
6. Run a triage-first prompt: "Run DIE, capa, and FLOSS on this file. Summarize capabilities. Then open it in Ghidra."

### Verification loop

Every decompiler claim needs verification. Use this loop:

1. Agent decompiles a function.
2. Agent writes a C or Python reimplementation.
3. Compile it.
4. Compare behavior with Unicorn or Qiling emulation of the original.
5. Diff the outputs.
6. If they match, mark verified. If not, feed the diff back to the agent.

For matching-decomp work, use objdiff instead of behavior comparison. Source: github.com/encounter/objdiff.

## Pitfalls

- **RetDec and Snowman are dead.** Do not build new workflows on them. RetDec last released v5.0 in 2022. Snowman is archived.
- **Cutter has no mature AI integration.** The only Cutter-native AI plugin is a one-author hobby project. Use radare2 or rizin core with r2mcp instead.
- **Intel PIN has no LLM ecosystem.** Use QBDI or DynamoRIO for new DBI work.
- **Manticore is archived.** Trail of Bits archived it. Do not use for new symbolic work. Use angr 10.x.
- **gdb and lldb lack first-party MCP.** You will drive them through shell commands or write a wrapper. Expect more friction than x64dbg.
- **GhidraMCP HTTP server is unauthenticated by default.** Issues #140 and #141 documented prompt injection through decompiled output and persistent stored injection through comment write-back. Run it on localhost only. Use read-only modes for untrusted binaries.
- **Prompt injection through binary strings is real.** Papers arXiv 2605.30667 and 2605.30677 show injection strings survive compilation and obfuscation. Treat all tool output as untrusted data.
- **LLM rename accuracy is plausible, not verified.** NDSS 2026 study found 85 percent accuracy vs human 66 percent on known algorithms, but only 57 percent vs 65 percent overall. Always check renamed symbols against context.
- **Sidekick and VIBRE are commercial AI layers.** They cost extra. The native MCP servers are free with the base product. Start with MCP before paying for the agent layer.
- **Binary Ninja headless MCP requires Commercial or Ultimate.** The free edition gets the GUI MCP server only.
- **JEB headless MCP is unverified.** The changelog confirms MCP tools exist. Whether they run without the GUI is unclear. Test before relying on it.

## See Also

- ../03-decomp/verification-loop.md — how to verify decompiler output
- ../03-decomp/ghidra-mcp-setup.md — Ghidra MCP configuration details
- ../03-decomp/ida-mcp-setup.md — IDA MCP configuration details
- ../04-dynamic/frida-mcp.md — Frida MCP server comparison
- ../04-dynamic/unicorn-qiling-oracle.md — using emulation as a verification oracle
- ../05-tools/multi-tool-mcp-suites.md — REA, Reversecore, Arkana deep dive
- ../06-malware/triage-pipeline.md — capa, FLOSS, DIE workflow
- ../07-formats/kaitai-llm-specs.md — LLM-generated Kaitai formats
- ../08-security/isolation.md — sandboxing agents that touch hostile binaries
- ../09-mobile/frida-android.md — Frida on Android
- ../10-firmware/binwalk-qiling.md — firmware extraction and emulation
