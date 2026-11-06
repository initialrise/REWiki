# Glossary: RE + AI Terms

> Tags: glossary, terminology, definitions | Difficulty: Any | Prerequisites: none

Short definitions for terms used across the wiki. Alphabetical.

---

## A

**Agent harness** — The program that runs the LLM loop and gives it tools. Claude Code, Codex CLI, Cursor, Gemini CLI are harnesses. The harness is not the model.

**Agent Skills** — A packaging format for reusable agent instructions. A directory with `SKILL.md` plus optional `scripts/`, `references/`, `assets/`. Progressive disclosure: only the name loads until activated.

**angr** — Python binary-analysis framework. CFG recovery, symbolic execution, decompilation. Version 10 has a Rust core and a built-in MCP server.

**Anti-analysis** — Techniques a binary uses to resist inspection: anti-debug, anti-VM, anti-dump, obfuscation, packing.

**APKs / DEX** — Android Package files contain Dalvik bytecode (DEX). jadx and apktool decompile them.

**asm / assembly** — The CPU's native instruction text. See [00-fundamentals/assembly-crash-course.md](../00-fundamentals/assembly-crash-course.md).

## B

**Binary Ninja** — Commercial decompiler/debugger. Version 6.0 (Krypton, Sept 2026) added a native MCP server in all editions.

**binwalk** — Firmware extraction and analysis tool. v3 is a Rust rewrite.

**Byte-match / matching decomp** — Reimplementing code in C so the compiled output is byte-identical (or near-identical) to the original. The strongest correctness oracle in RE.

## C

**capa** — Mandiant's capability detection tool. Identifies what a binary *does* (injects, persists, communicates) via FLIRT signatures.

**Call graph** — The graph of which functions call which. The map agents use to pick work slices.

**CLAUDE.md / AGENTS.md** — Context files a harness reads at session start. Hold project facts, conventions, and tool quirks.

**Concolic execution** — Concrete + symbolic execution together. Triton and angr do this. Feeds path constraints to an SMT solver.

**Capa / floss** — floss extracts and deobfuscates strings (stack strings, XOR-encoded). capa detects capabilities.

## D

**Decompiler** — Tool that lifts assembly to C-like pseudocode. Ghidra, IDA, Binary Ninja, RetDec.

**DEX** — Dalvik Executable. Android's bytecode format.

**decomp.me** — Collaborative matching-decompilation platform. Upload a function, write C, get an objdiff score.

**Detonation** — Actually running a suspicious binary in a sandbox to observe behavior.

**DIE (Detect It Easy)** — Packer/compiler/protector identifier. First triage step.

## E

**ELF** — Executable and Linkable Format. Linux/Unix binaries. See [00-fundamentals/binary-formats.md](../00-fundamentals/binary-formats.md).

**Evidence ledger** — A file or database recording every claim, its evidence, and its verdict. Survives agent context loss.

## F

**Floss** — FLARE Obfuscated String Solver. Extracts strings hidden by stack construction and encoding.

**Frida** — Dynamic instrumentation toolkit. Injects a JS runtime into processes. The standard for runtime hooking.

## G

**Ghidra** — NSA's open-source RE suite. Version 12.2 current. Headless via `analyzeHeadless`. Many MCP bridges exist.

**GOT/PLT** — Global Offset Table / Procedure Linkage Table. ELF's lazy-binding machinery. Relevant to unpacking and hooking.

## H

**Headless** — Running a tool without a GUI. `analyzeHeadless` for Ghidra, `idalib` for IDA. Required for agent automation.

**HITL** — Human-in-the-loop. Checkpoints where a person approves agent actions.

## I

**IDA Pro** — Hex-Rays' commercial disassembler/decompiler. Version 9.5 current. Official MCP server since 9.4.

**IAT** — Import Address Table. PE's table of imported functions. Packers destroy it; dumpers rebuild it.

**IFUNC** — Indirect function. ELF resolver picks the implementation at load time. A RE blind spot.

**IL2CPP** — Unity's AOT compilation of C# to C++. Metadata recovery via Il2CppDumper/Il2CppInspector.

**IOC** — Indicator of compromise. Hashes, domains, IPs, mutexes extracted during malware analysis.

**IRP** — I/O Request Packet. Windows kernel driver I/O unit. See [06-topics/windows-kernel-drivers.md](../06-topics/windows-kernel-drivers.md).

## J

**jadx** — DEX/APK decompiler. Java-written, has CLI and GUI. Multiple MCP servers exist.

**JEB** — Commercial multi-format decompiler (Android, native, firmware). Has an MCP server.

## K

**Kaitai Struct** — Declarative binary format description language. LLMs generate `.ksy` specs well.

## L

**LLM4Decompile** — Family of specialist assembly-to-C models (1.3B–33B). Beats general LLMs on bulk decompile.

**LLM** — Large language model. The "AI" in AI-assisted RE.

## M

**Mach-O** — Apple's executable format. See [00-fundamentals/binary-formats.md](../00-fundamentals/binary-formats.md).

**MalwareBench / BIOPSY-Bench / SRE-Bench / DecBench / Retrobench** — Benchmarks measuring agent performance on RE tasks. See [07-advanced/model-selection.md](../07-advanced/model-selection.md).

**Map-reduce** — Split work into units, process in parallel, merge results. The swarm pattern for bulk decompilation.

**MCP (Model Context Protocol)** — The standard bridge between LLM agents and tools. Every major RE tool has an MCP server in 2026.

**Matching decomp** — See Byte-match.

## N

**NativeAOT** — .NET ahead-of-time compilation. Produces native code with no IL. Breaks normal .NET decompilers.

**Nuitka / Cython** — Python-to-native compilers. Their output looks like stripped C, not Python bytecode.

## O

**objdiff** — The scoring tool for matching decomp. Compares compiled bytes to target bytes.

**OLLVM** — Obfuscator-LLVM. Control-flow flattening, bogus control flow, string encryption at compile time.

## P

**PE** — Portable Executable. Windows format. See [00-fundamentals/binary-formats.md](../00-fundamentals/binary-formats.md).

**Pseudocode** — The C-like output of a decompiler. Not source code. Verify against assembly.

**Prompt injection** — Malicious instructions embedded in content the agent reads. Binaries carry it in strings and comments. See [07-advanced/ai-security-threats.md](../07-advanced/ai-security-threats.md).

## Q

**Qiling** — Full user-mode OS emulation framework. GDB stub support. Cross-arch.

## R

**Radare2 / rizin** — Open-source RE frameworks. rizin is the community fork of radare2's core. Both have MCP servers.

**REA** — `morluto/rea`, the "reverse-engineer-anything" multi-tool harness that went viral in 2026. See the report for caveats on its claimed scale.

**reverify** — Tool that checks LLM claims about a binary with deterministic engines. Returns VERIFIED/REFUTED/INCONCLUSIVE.

**Remnux** — Linux distro for malware analysis. Ships with hundreds of RE tools.

## S

**SMT solver** — Satisfiability-modulo-theories solver (Z3, Bitwuzla). Proves or refutes claims about code paths.

**Static recompilation** — Translating a whole binary to C once, then compiling natively. N64Recomp, XenonRecomp. Different from matching decomp.

**Swarm** — Multiple worker agents processing slices of a binary in parallel under a coordinator.

## T

**Triage** — First-pass automated assessment: what is this, what does it do, is it packed, is it interesting.

**TLS callback** — Windows PE function that runs before `main`/`DllMain`. Packer favorite for early unpacking.

## U

**Unicorn** — CPU emulator (QEMU-derived). Emulates instructions without an OS. Foundation for many analysis tools.

**UPX** — The most common packer. `upx -d` undoes it.

## V

**VMProtect / Themida** — Commercial protectors. Virtualization-based obfuscation. See [06-topics/deobfuscation.md](../06-topics/deobfuscation.md).

## W

**WinDbg** — Microsoft's debugger. Kernel-mode via KDNET. WinDbgX-MCP exists.

**WASM** — WebAssembly. romdev compiles console emulators to WASM for agent access.

## X

**x64dbg** — Open-source Windows debugger. `x64dbg-mcp-server` plugin gives agents HTTP access.

**XOR** — The most common obfuscation. `strings` misses XORed strings; floss and emulation find them.

## Y

**YARA** — Pattern-matching rule language for binaries. Rule-based triage.

---

See also: [cheatsheet.md](cheatsheet.md) for commands and prompts.
