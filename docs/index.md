# AI-Assisted Reverse Engineering Wiki

A HackTricks-style field manual for reverse engineers who use AI in 2026.

The reader is a working reverse engineer. The goal is practical setup, not theory. Each page gives commands, configs, prompts, and pitfalls. Claims that could not be verified are marked "reported" or "unverified".

Companion document: [BASE_REPORT.md](https://github.com/initialrise/REWiki/blob/main/BASE_REPORT.md) — the 32-agent research report this wiki is built on.

---

## How to Use This Wiki

1. Start at [Quick Start Path](#quick-start-path) if the sandbox is not built yet.
2. Jump to the topic page for your target type (PE, APK, firmware, game ROM).
3. Read [Verification Loops](03-decomp/verification-loop.md) before you trust any agent output.
4. Read [AI Security Threats](07-advanced/ai-security-threats.md) before you point an agent at hostile binaries.

---

## Section Map

### 00-fundamentals — Core Knowledge the AI Pages Assume

| Page | What it gives you |
|---|---|
| [assembly-crash-course.md](00-fundamentals/assembly-crash-course.md) | x86/x64 asm for pseudocode readers: registers, flags, idioms, calling conventions, prologue reading, drills |
| [binary-formats.md](00-fundamentals/binary-formats.md) | PE, ELF, and Mach-O anatomy: loader vs analyst view, imports/exports/relocations, packed-layout signals |
| [reading-pseudocode.md](00-fundamentals/reading-pseudocode.md) | What decompilers get wrong, verification habits, red flags in LLM output |

### 01-setup — Build the Lab

| Page | What it gives you |
|---|---|
| [linux-sandbox-base.md](01-setup/linux-sandbox-base.md) | Full copy-paste Ubuntu RE sandbox: packages, directory layout, non-root user, firewall, snapshot workflow |
| [agent-sandboxing.md](01-setup/agent-sandboxing.md) | Docker/gVisor/Kata isolation for the agent itself; MCP gateways; the two-agent pattern |
| [malware-isolation.md](01-setup/malware-isolation.md) | REMnux, FLARE-VM, CAPEv2, ANY.RUN; detonation vs triage; safe agent submission via API |
| [network-isolation.md](01-setup/network-isolation.md) | nftables egress rules, DNS sinkholes, fake-net, mitmproxy, separating agent traffic from target traffic |

### 02-collab — Make Agents Collaborate

| Page | What it gives you |
|---|---|
| [multi-agent-patterns.md](02-collab/multi-agent-patterns.md) | Orchestrator-worker, planner-executor-verifier, debate, map-reduce, adversarial verification |
| [agent-orchestration-tools.md](02-collab/agent-orchestration-tools.md) | Claude Code subagents, Codex, Cursor, Gemini CLI, Agents SDK, LangGraph, CrewAI, AutoGen |
| [claude-code-setup.md](02-collab/claude-code-setup.md) | MCP config, skills layout, CLAUDE.md template, permissions, hooks, headless mode, prompt patterns |
| [prompt-patterns.md](02-collab/prompt-patterns.md) | The RE prompt template, per-task patterns, output schemas, refusal handling, injection hygiene, prompt library |
| [codex-cursor-setup.md](02-collab/codex-cursor-setup.md) | Codex CLI config.toml, Cursor rules, Gemini CLI, Goose, Aider, Kimi Code comparison |
| [context-engineering.md](02-collab/context-engineering.md) | Chunking decompilation, call-graph slices, RAG over pseudocode, 1M-context vs vector DB |
| [llm-workflows-recipes.md](02-collab/llm-workflows-recipes.md) | Six named prompt chains: 30-minute triage, bulk rename, license check, crash explain, Frida hook, protocol recovery |

### 03-decomp — Decompile Piece by Piece

| Page | What it gives you |
|---|---|
| [triage-and-mapping.md](03-decomp/triage-and-mapping.md) | First-look commands, entry points, call-graph slicing, the map document agents consume |
| [decompile-workflow.md](03-decomp/decompile-workflow.md) | The human+AI loop: load, triage, map, batch, name, verify, document |
| [batch-decompilation.md](03-decomp/batch-decompilation.md) | Headless pipelines (analyzeHeadless, idalib, BN headless), chunking, specialist decomp models, cost |
| [verification-loop.md](03-decomp/verification-loop.md) | reverify, compile-and-diff, execute-and-compare, claim ledgers, confidence fields |
| [decomp-orchestration.md](03-decomp/decomp-orchestration.md) | Agent swarms for decompilation: fan-out, merge, shared SQLite state, checkpoint/resume |

### 04-recomp — Matching Decomp and Recomp

| Page | What it gives you |
|---|---|
| [matching-decomp.md](04-recomp/matching-decomp.md) | decomp.me workflow, objdiff scoring, compiler matching, AI-written matching C, console projects |
| [swmh-auto-recomp.md](04-recomp/swmh-auto-recomp.md) | Static recompilers: N64Recomp, XenonRecomp, firmware rehosting, LLM-assisted porting |
| [n64-decomp.md](04-recomp/n64-decomp.md) | Nintendo 64 matching decomp: o32, libultra, IDO, asm-differ, objdiff |
| [ps1-ps2-decomp.md](04-recomp/ps1-ps2-decomp.md) | PlayStation 1/2 recompilation: PSY-Q lineage, PS2Recomp, Tomba! case study |
| [ps3-ps4-ps5.md](04-recomp/ps3-ps4-ps5.md) | PS3 Cell/PS4/PS5 console RE: hypervisor, homebrew, .self/.sprx |
| [xbox-recomp.md](04-recomp/xbox-recomp.md) | Xbox/Xbox 360 PowerPC recompilation: XEX, XenonRecomp, UnleashedRecomp |
| [rom-hacking.md](04-recomp/rom-hacking.md) | ROM patching, translation, IPS/UPS/BPS formats, AI-assisted translation |
| [handhelds-3ds-vita-psp.md](04-recomp/handhelds-3ds-vita-psp.md) | PSP, PS Vita, 3DS, Switch Lite: EBOOT/VPK/CIA/NSP formats, CFW, Ghidra extensions |
| [gamecube-wii.md](04-recomp/gamecube-wii.md) | GameCube/Wii PPC decomp: DOL/REL sections, melee/Project M, Dolphin, save formats |
| [switch-decomp.md](04-recomp/switch-decomp.md) | Switch Horizon OS RE: prod.keys, sigpatches, Atmosphère, XCI/NSP, ARM64 decomp |

### 04-dynamic — Execute the Target Safely

| Page | What it gives you |
|---|---|
| [x64dbg-windbg.md](04-dynamic/x64dbg-windbg.md) | x64dbg MCP automation, PyBridge scripts, WinDbg/WinDbgX-MCP, headless limits |
| [gdb-gef-pwndbg.md](04-dynamic/gdb-gef-pwndbg.md) | gef vs pwndbg, scripted crash triage, rr record-replay, gdb MCP servers |
| [frida-deep-dive.md](04-dynamic/frida-deep-dive.md) | Interceptor vs Stalker, Java/ObjC bridges, frida-mcp servers, LLM-assisted script writing |
| [emulation-unicorn-qiling.md](04-dynamic/emulation-unicorn-qiling.md) | Unicorn function emulation, Qiling OS emulation and GDB stub, QBDI/DynamoRIO/PIN tracing, Triton/angr concolic paths, LLM harness generation |
| [unpacking-dumping.md](04-dynamic/unpacking-dumping.md) | Runtime unpacking: UPX, Scylla dump+IAT fix, pe-sieve, Frida dumpers, .NET unpackers |
| [fuzzing.md](04-dynamic/fuzzing.md) | Coverage-guided fuzzing: AFL++, libFuzzer, honggfuzz, harnesses, QEMU mode, structure-aware mutators, crash triage, LLM assists |

### 05-tools — Tool and Bridge Catalogs

| Page | What it gives you |
|---|---|
| [tool-catalog.md](05-tools/tool-catalog.md) | Decompilers, debuggers, dynamic tools, triage tools — MCP support, headless mode, license |
| [mcp-catalog.md](05-tools/mcp-catalog.md) | Every MCP server: official vendor vs community, install commands, security warnings |
| [skills-catalog.md](05-tools/skills-catalog.md) | Agent Skills format spec and the RE skill repos worth installing |

### 06-topics — By Target Type

| Page | Target |
|---|---|
| [mobile-android-re.md](06-topics/mobile-android-re.md) | APK, DEX, smali, Frida on-device, unpacking |
| [apple-ios-re.md](06-topics/apple-ios-re.md) | Mach-O, ipsw, jailbreak toolkits, Frida iOS |
| [firmware-iot-re.md](06-topics/firmware-iot-re.md) | binwalk/unblob extraction, Firmadyne, UART/JTAG, ARM |
| [malware-analysis.md](06-topics/malware-analysis.md) | Triage pipeline, agentic malware orchestrators, IOCs, benchmarks |
| [deobfuscation.md](06-topics/deobfuscation.md) | OLLVM, VMProtect, Themida, JS/JavaScript deobfuscation |
| [protocol-reverse.md](06-topics/protocol-reverse.md) | PCAP to grammar, Substrat, ProtoForge, Kaitai, replay verification |
| [linux-elf-re.md](06-topics/linux-elf-re.md) | ELF anatomy, `.so` analysis, IFUNC, stripped Go/Rust, glibc internals, `LD_PRELOAD`, core dumps, systemd units |
| [managed-code-re.md](06-topics/managed-code-re.md) | .NET, Java, Go, Rust — decompilers, symbol recovery, deobfuscators |
| [dotnet-deep-dive.md](06-topics/dotnet-deep-dive.md) | .NET internals: metadata heaps, ILSpy/dnSpyEx/dotPeek, de4dot forks, MegaDumper/ExtremeDumper, NativeAOT |
| [packed-binaries.md](06-topics/packed-binaries.md) | Packer taxonomy, detection signals, unpack → dump → IAT rebuild → verify workflow |
| [windows-kernel-drivers.md](06-topics/windows-kernel-drivers.md) | WDM/KMDF drivers, DriverEntry, IRP dispatch, WinDbg kernel debugging, IOCTL decoding, PatchGuard |
| [macos-system-re.md](06-topics/macos-system-re.md) | Mach-O deep dive, SIP/hardened runtime, entitlements, dyld cache extraction, XPC |
| [android-native-so.md](06-topics/android-native-so.md) | JNI bridges, RegisterNatives, native Frida hooks, OLLVM-protected `.so` files |
| [game-engine-re.md](06-topics/game-engine-re.md) | Unity IL2CPP metadata recovery, Unreal GObjects/GNames, custom engines, asset formats |
| [anti-cheat-re.md](06-topics/anti-cheat-re.md) | EAC/BattlEye/Vanguard landscape, kernel drivers, integrity checks, authorized-study methodology |
| [web3-blockchain-re.md](06-topics/web3-blockchain-re.md) | EVM bytecode, contract decompilers, proxy patterns, MEV bots, storage layout |
| [ctf-ai.md](06-topics/ctf-ai.md) | CTF challenges with AI: which categories it solves, contamination warning, practice resources, CTF skill repos |
| [cloud-analysis.md](06-topics/cloud-analysis.md) | Hosted analysis platforms: ida-instances, VirusTotal AI, ANY.RUN, Joe Sandbox, API submission patterns |
| [windows-internals-re.md](06-topics/windows-internals-re.md) | Windows internals for RE: PE loading, heap internals, ntdll, PEB/TEB, module stomping, ETW |
| [java-reverse.md](06-topics/java-reverse.md) | JVM/class-file RE: CFR/Vineflower/Procyon, ProGuard/Zelix obfuscators, JVMTI, Frida Java bridge |
| [go-rust-re.md](06-topics/go-rust-re.md) | Go and Rust native binaries: pclntab/GoReSym recovery, Rust mangling, panic strings, CGO |
| [vb6-delphi-legacy.md](06-topics/vb6-delphi-legacy.md) | Legacy language RE: VB6 p-code, Delphi .dfm, PowerBasic, Fortran, UTF-16 pitfalls |

### 07-analysis — Deep Analysis Techniques

| Page | Topic |
|---|---|
| [symbolic-execution.md](07-analysis/symbolic-execution.md) | angr 10, Triton concolic, KLEE, Z3/Bitwuzla, when paths explode, LLM constraint extraction |
| [binary-diffing.md](07-analysis/binary-diffing.md) | Diaphora, BinDiff, function matching, patch diffing, version comparison, ghidriff |
| [malware-config.md](07-analysis/malware-config.md) | Encrypted config extraction, crypto identification, dynamic dumping, YARA signatures |
| [vulnerability-research.md](07-analysis/vulnerability-research.md) | Bug classes agents find, fuzz-then-audit methodology, CodeQL vs binary audit, patch diffing for 1-days |
| [kernel-exploitation.md](07-analysis/kernel-exploitation.md) | Kernel RE differs: IRQL, PatchGuard, HVCI, IOCTL fuzzing, pool exploitation, syzkaller |
| [memory-forensics.md](07-analysis/memory-forensics.md) | Memory acquisition (winpmem, LiME), Volatility 3, injected code, YARA over memory |
| [format-re-file-formats.md](07-analysis/format-re-file-formats.md) | Proprietary format methodology: sampling, Kaitai specs, ImHex patterns, parser generation |
| [hardware-jtag.md](07-analysis/hardware-jtag.md) | UART consoles, JTAG/SWD probes, chip-off, SOIC-8 clips, flash programmers, logic analyzers |
| [vm-analysis.md](07-analysis/vm-analysis.md) | Custom VMs and bytecode: dispatch loops, handler tables, lifting (Mergen/VTIL/d810), symbolic execution |
| [patching-cracking.md](07-analysis/patching-cracking.md) | Patch primitives (NOP, force-jump, return-true), keygenning methodology, license-check patterns, anti-tamper |
| [game-hacking.md](07-analysis/game-hacking.md) | Memory scanning, pointer chains, DLL injection, ESP/wallhack architecture, anti-cheat interaction |

### 07-ai — AI Agent Layer

| Page | Topic |
|---|---|
| [agent-memory-systems.md](07-ai/agent-memory-systems.md) | What survives compaction, memory types, MemGPT/Letta patterns, knowledge bases, skills as memory, poisoning and stale facts |
| [agent-internals.md](07-ai/agent-internals.md) | Agent loops, tool calling, context windows, planning, reflection, harness internals |
| [embeddings-rag.md](07-ai/embeddings-rag.md) | Embedding models for code, vector stores, RAG over decompiled code, hybrid search |
| [evals-benchmarks.md](07-ai/evals-benchmarks.md) | Full benchmark landscape: SRE-Bench, DecBench, Retrobench, MalwareBench, ICall-Bench, contamination, local evals |
| [fine-tuning.md](07-ai/fine-tuning.md) | LoRA/QLoRA on RE data, dataset construction, when fine-tuning beats prompting |
| [ml-for-re.md](07-ai/ml-for-re.md) | Specialist RE models: LLM4Decompile family, CodeInverter, ReCopilot, AutoDecompiler, Nova, when 1.3B beats GPT-6 |
| [local-models.md](07-ai/local-models.md) | Ollama/vLLM/llama.cpp serving, Qwen3-Coder-Next, quantization tradeoffs, air-gapped setup, MCP integration |
| [red-teaming-ai.md](07-ai/red-teaming-ai.md) | Red-team your own AI RE setup: injection fixtures, MCP poisoning tests, exfiltration checks, disclosure |

### 07-advanced — Hard Problems

| Page | Topic |
|---|---|
| [anti-analysis.md](07-advanced/anti-analysis.md) | Anti-debug, anti-VM, anti-dump; Frida bypass generation; when to go static |
| [firmware-recomp.md](07-advanced/firmware-recomp.md) | Console/game recompilation landscape and firmware rehosting |
| [ai-security-threats.md](07-advanced/ai-security-threats.md) | Prompt injection from binaries, MCP supply-chain attacks, defense stack |
| [model-selection.md](07-advanced/model-selection.md) | Benchmarks, cost per task, local models, the Opus 5.5 classifier issue |

### 08-case-studies — End-to-End Recipes

| Page | Content |
|---|---|
| [real-world-recipes.md](08-case-studies/real-world-recipes.md) | Six walkthroughs: name a stripped PE, unpack VMProtect, rebuild a protocol, port a console game, triage an APK, recover a .NET license check |
| [more-end-to-end-case-studies.md](08-case-studies/more-end-to-end-case-studies.md) | Four more recipes: .NET RAT loader, anti-cheat driver IOCTLs, game-save format, mobile cert pinning + API protocol |

### 09-ops — Run the Practice

| Page | What it gives you |
|---|---|
| [daily-workflows.md](09-ops/daily-workflows.md) | The RE day loop with AI, session templates, checklists per task type, timeboxing rules |
| [notes-and-evidence.md](09-ops/notes-and-evidence.md) | Evidence ledgers, Obsidian vault structure, git for analysis state, naming conventions |
| [cost-tracking.md](09-ops/cost-tracking.md) | Token cost anatomy, per-task published costs, cheap/frontier/local routing, budget caps |
| [legal-and-ethics.md](09-ops/legal-and-ethics.md) | DMCA §1201, CFAA, EU decompilation allowance, license terms, bright lines, AI/cloud wrinkles |

### 10-communities — Learn and Connect

| Page | What it gives you |
|---|---|
| [indexes.md](10-communities/indexes.md) | Master list of RE indexes: Awesome-REA, ReversingID, crackmes.one, decomp.me, Malpedia, plugin lists |
| [learning-paths.md](10-communities/learning-paths.md) | Three tracks (experienced RE + AI, programmer entering RE, student), free vs paid resources, 90-day plan |

### 99-meta — Reference

| Page | What it gives you |
|---|---|
| [cheatsheet.md](99-meta/cheatsheet.md) | One-screen command/prompt/model reference |
| [glossary.md](99-meta/glossary.md) | Alphabetical definitions of RE and agent terms |

---

## Quick Start Path

The fastest route from zero to a working AI-assisted RE setup:

1. [assembly-crash-course.md](00-fundamentals/assembly-crash-course.md) and [binary-formats.md](00-fundamentals/binary-formats.md) — the bedrock. Skim if rusty.
2. [linux-sandbox-base.md](01-setup/linux-sandbox-base.md) — build the VM. Run the script. Take a snapshot.
2. [agent-sandboxing.md](01-setup/agent-sandboxing.md) — decide the isolation tier. Start with Docker per session.
3. [claude-code-setup.md](02-collab/claude-code-setup.md) or [codex-cursor-setup.md](02-collab/codex-cursor-setup.md) — wire the harness to your tools.
4. [mcp-catalog.md](05-tools/mcp-catalog.md) — install one MCP server for your primary tool (Ghidra or IDA).
5. [triage-and-mapping.md](03-decomp/triage-and-mapping.md) then [decompile-workflow.md](03-decomp/decompile-workflow.md) — run the loop on a real binary.
6. [verification-loop.md](03-decomp/verification-loop.md) — add the trust gate before you scale up.
7. [decomp-orchestration.md](03-decomp/decomp-orchestration.md) — only then add swarms.
8. [daily-workflows.md](09-ops/daily-workflows.md) — keep the practice sustainable once it is running.

---

## The Five Rules

These rules appear on almost every page. They are the wiki in one screen.

1. **Verify everything.** Agents hallucinate function names and plausible pseudocode. Deterministic checks decide.
2. **Isolate the agent.** Binaries are an injection surface. Sandbox the session, allowlist tools, read-only evidence.
3. **Chunk the context.** Never feed a whole binary or a whole decompile dump to one prompt. Function-at-a-time, map-reduce, or RAG.
4. **Separate reader from verifier.** The agent that reads hostile content is not the agent that approves claims.
5. **Budget before you swarm.** Parallel agents multiply cost and contradictions. Fan out only for bulk work with a shared ledger.

---

## Reading Order by Goal

| Goal | Pages |
|---|---|
| Set up the lab once | 01-setup/*, then 02-collab/claude-code-setup.md |
| Decompile a PE/APK/firmware | 03-decomp/* in order, plus your 06-topics page |
| Recompile a game or console | 04-recomp/* (per-console pages: n64, ps1-ps2, ps3-ps4-ps5, switch, xbox, gamecube-wii, handhelds), 07-advanced/firmware-recomp.md |
| Analyze malware safely | 01-setup/malware-isolation.md, 06-topics/malware-analysis.md, 07-advanced/ai-security-threats.md |
| Scale to swarms | 02-collab/multi-agent-patterns.md, 03-decomp/decomp-orchestration.md |
| Pick models and control cost | 07-advanced/model-selection.md, 02-collab/context-engineering.md |
| Understand what AI cannot do | 03-decomp/verification-loop.md, 08-case-studies/real-world-recipes.md |

---

## Conventions

- STE style: short sentences, one idea per sentence.
- "Reported" or "unverified" marks claims without a primary source.
- Commands assume Ubuntu 24.04+ unless stated otherwise.
- MCP configs assume Claude Code unless stated otherwise. Other harnesses have parallel pages.
- Dates and versions are as of 2026-11-05.

---

## Deploying This Wiki

The wiki builds to a static site with MkDocs Material. Build and deploy instructions live in `DEPLOY.md` at the repo root (GitHub Pages workflow included).
