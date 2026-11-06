# Matching Decompilation and Recompilation

> Tags: game-reverse-engineering, decompilation, recompilation, objdiff, decomp.me | Difficulty: Intermediate-Advanced | Prerequisites: [Decompiler workflow](../03-decomp/decompile-workflow.md), [Verification loops](../03-decomp/verification-loop.md)

## Overview

Matching decompilation means rewriting a binary back into C or C++ that compiles to the same bytes as the original. It is the core workflow of game preservation projects. It is not the same as ordinary decompilation. Ordinary decompilation aims for readable source. Matching decompilation aims for byte identity, or the highest achievable match score.

Byte identity is the standard because it is verifiable. The compiler either reproduces the original object or it does not. A human can check the result. A script can check the result. An LLM cannot argue with it.

The 2026 change is that coding agents now do the inner loop. The agent writes C. The compiler builds it. objdiff scores the diff. The agent fixes and repeats. Benchmarks show this works well on small and medium functions and poorly on large optimized code.

This page covers:

- The matching-decomp loop and the tools that run it.
- The decomp.me platform and its scoring.
- Compiler and flag matching. This is the hidden skill of the whole field.
- How to prompt an agent for matching C, and how to run the iteration loop.
- Recompilation projects by console: N64, PlayStation, GameCube, Wii, DS, Switch, Xbox 360.
- AI-specific workbenches: rebrew, decomp-goal-harness, DS Decomp Studio, decomp.wtf.
- Where AI helps and where it fails.

Matching decomp lives in tension with parts of the community. Some projects do not accept AI-generated contributions. Read each project's contribution rules before you submit agent-written code. See the Pitfalls section.

## How It Works

### The basic loop

Every matching-decomp project runs the same loop:

1. Split the ROM into functions. Tools: splat, spimdisasm, ds-decomp, decomp-toolkit.
2. Pick one function that is not matched yet.
3. Read its disassembly and its context: callers, callees, data references.
4. Write C that plausibly produced those instructions.
5. Compile with the original compiler and the original flags.
6. Compare the output object with the original. Tools: objdiff, asm-differ, the project's own score script.
7. Read the instruction diff. Fix the C. Repeat.
8. When the function scores 100 percent, commit it under the project's conventions.

The loop is deterministic. Step 6 is the oracle. Everything else is a guess.

### What "matching" means in practice

| Term | Meaning |
|---|---|
| Byte-match / matched | The compiled function is identical to the original. Some projects also call this "exact" or "true". |
| Score / fuzzy match | objdiff reports a percentage below 100. Shows how close the instructions are. |
| Equivalent | The function matches under a relaxed comparison, for example with different register choices. Used by some projects such as ZeldaRET projects. |
| Nonmatching | The function has a C stub that builds but does not match the original. |
| Linked | Every function and every piece of data in a file match, and the whole ROM rebuilds byte for byte. The strongest result. See decomp.dev for the linked measure. |

Do not confuse "function matched" with "game decompiled". A project can sit at 90 percent function coverage and still fail to link the final ROM because of data layout, literal pools, or one stubborn function.

### The three artifact layers

A mature project has three layers:

| Layer | Contents | Tools |
|---|---|---|
| Source | C and C++ files, headers, linker script, build script | The decomp repo itself |
| Build config | Compiler version, flags per module, object list | Makefile, CMake, configure.py, ninja |
| Scoring | Per-function diff data, progress reports | objdiff, asm-differ, decomp-permuter |

Most project-specific pain lives in the build config layer. Getting it right is what makes step 5 reproduce the original bytes.

## Setup

### Choose a project, not a ROM

Start from an existing decomp project, not from a raw ROM. Reasons:

- The toolchain is already pinned. Compiler version and flags are known.
- The ROM splitting, symbol tables, and headers exist.
- Someone has already matched the easy functions. You work on hard ones.
- You can see how the project writes C: its macros, types, and naming style.

Project catalogs:

- decomp.dev lists community projects by platform. About 245 projects were cataloged in late 2026, per decomp.wtf documentation.
- recomp.fyi indexes recompilation projects.
- GitHub orgs: `zeldaret` (Ocarina of Time, Majora's Mask, Wind Waker and others), `n64decomp` (Super Mario 64, Mario Kart 64, GoldenEye, Banjo-Kazooie), `OpenCommunityEdition` (Halo CE), `gta-reversed` (GTA: SA), `sm64pc` (Super Mario 64 PC port).
- DS Decomp Studio tracks 82 DS games with per-function progress, updated daily by its maintainers.

### The compiler toolchain

Matching requires the exact compiler the original used, or the closest available equivalent. Examples:

| Platform | Typical compiler | Notes |
|---|---|---|
| N64 | IDO 5.3 or 7.1, KMC GCC 2.7.2 | IDO is proprietary. KMC GCC is a reimplementation of SGI's gcc 2.7.2. Most N64 projects accept KMC unless the code demands IDO. |
| PlayStation 1 | GCC 2.7.2 or 2.8.1 (PSY-Q era) | Available as Linux binaries through the psx toolchain. PCSX-Redux also carries period compilers. |
| GameCube / Wii | Metrowerks CodeWarrior for GC/Wii | Proprietary. The decomp community uses a reconstructed CodeWarrior distribution (mwcc) inside project containers. |
| Nintendo DS | mwccarm (CodeWarrior for DS, versions 1.2 to 2.x for DS titles, up to 1.6 for DSi per decomp.wtf docs) | The DS community standardized on mwccarm inside ds-decomp projects. |
| Game Boy Advance | agbcc (GCC 2.95.3 port) | Standard for pokefirered-style projects. |
| Nintendo Switch | devkitPro GCC, or mwccarm 4.0.14 for first-party titles | Modern recomp projects such as LASRecomp use devkitARM. |
| Xbox 360 | Xenon toolchain (MSVC-derived) | XenonRecomp bypasses source matching and lifts to C. See below. |

Where the compilers come from:

- decomp.me hosts compilers server-side for supported targets. You never install them.
- decomp.wtf ships pinned, checksum-verified compilers for N64, PS1, PS2, GC/Wii, DS, and GBA (it stopped development in October 2026 but the code remains under MIT).
- Each decomp repo usually documents or scripts its toolchain install. Examples: `setup-msvc` for MSVC targets, KMC GCC builds for N64, `mwccarm` distribution for DS.
- romdev ships period compilers as WebAssembly: KMC GCC 2.7.2, EGCS 1.1.2, PS1 GCC 2.6.3, and mips-linux-gnu GCC for its decomp tool path. IDO is not distributed because it is proprietary.

### Flags matter more than the compiler

The same C with different flags produces different bytes. Common flag families:

- Optimization level: `-O1`, `-O2`, `-O3`, `-Os`. Most game code is `-O2`.
- Architecture and ABI options: `-mips1`, `-mips2`, `-mips3`, soft-float versus hard-float, 32-bit versus o32 ABI.
- Compiler-specific extensions: IDO options such as `-g0`, language dialect flags, and CodeWarrior `-O4,p` style options.
- Debug info off. Matching projects build without debug info.
- Sometimes per-file flag overrides. Large projects override flags for specific translation units.

How to find the flags:

1. Check the project's README, Makefile, or `configure.py`.
2. Check a sibling project on the same platform and compiler.
3. Check decomp.me: each supported target there has a known flag set.
4. Use a flag-search tool. rebrew has a built-in compiler flag search. decomp-permuter explores source permutations, not flags, but several projects keep a `flags` search script.
5. Experiment: compile one known-matched function with candidate flags and see which reproduces its bytes.

Do not guess flags blindly. A flag mismatch makes every function unmatchable and looks like a source problem.

### objdiff and the scoring tools

| Tool | URL | Role |
|---|---|---|
| objdiff | github.com/encounter/objdiff | The standard. Compares target object with candidate object instruction by instruction. Used by decomp.me, DS Decomp Studio, and most DS/GC/Wii projects. |
| asm-differ | github.com/simonlindholm/asm-differ | Simpler objdump-based diff. Still used by older projects. |
| decomp-permuter | github.com/simonlindholm/decomp-permuter | Enumerates source permutations (statement order, temporary names, casts) to find a matching variant automatically. |
| spimdisasm | github.com/ethteck/spimdisasm | Splits MIPS binaries into functions and data. Standard for N64/PS1. |
| splat | github.com/ethteck/splat | General ROM splitter. Symbol maps, overlays, multiple architectures. |
| ds-decomp | github.com/AetiasHax/ds-decomp | The DS toolchain: splitting, mwccarm build, matching verification. |

objdiff usage in a typical project:

```
objdiff diff -o target.o -O candidate.o   # exact flags depend on the objdiff version, check its docs
```

Most projects wrap objdiff in scripts. Do not fight the wrapper. Read the project's `tools/` or `utils/` directory first.

## Usage

### decomp.me: the collaborative platform

- Site: https://decomp.me
- Source: github.com/decompme/decomp.me (Next.js frontend, Django backend, MIT license)
- Self-hostable. Docker-based local install documented in DOCKER.md.

What it provides: a catalog of supported games and compilers, a web editor for one-function C, server-side compilation with the target's original compiler and flags, instruction-level diff against the original object, a 0-100 score where 100 submits to the shared decomp, and a REST API. Platforms include N64, GameCube, Wii, DS, PS1, GBA, and others.

Workflow on decomp.me:

1. Find a game and a function. Sort by score or by "easiest first".
2. Read the disassembly and the surrounding context.
3. Paste C into the editor. The site compiles and diffs automatically.
4. Read the diff. Common diffs: register allocation choices, instruction scheduling, constant materialization, branch polarity.
5. Iterate until the score reaches 100.
6. Submit. Maintainers review and merge.

Using an agent with decomp.me:

- The REST API returns compile results and diffs as structured data. An agent can call it in a loop.
- decomp.wtf used this API pattern internally before it was discontinued.
- romdev's `decomp` tool wraps splat-based N64 and PS1 projects with the same compile-compare-permute loop in JavaScript/WASM.
- Write your own loop if needed: fetch disassembly, ask the model for C, POST to the API, parse the diff, repeat.

Practical notes: learn to read the diff view before you ask an AI for help. 100 percent is strict byte match at the function level. Some projects use "equivalent" for relaxed matches. Flag sets are applied by the site. You can watch other users' attempts on the same function, which is the fastest way to learn what a given compiler does.

### The AI iteration loop

The reliable pattern for agent-driven matching:

1. Give the agent one function at a time. Not a file. Not a module.
2. Give it the disassembly, the calling context, and any already-matched sibling functions for style.
3. Give it the compiler and flags, or a compile command it can run.
4. Let it compile, diff, and read the diff.
5. Cap the attempts. Retrobench uses 25 builds per function as a budget. Human decompers often allow more for hard functions, but diminishing returns set in.
6. Record the result. Keep the best-scoring C even if not perfect, under project rules.

Prompt template for a single function:

```
You are writing C that must compile to byte-identical MIPS assembly.

Compiler: KMC GCC 2.7.2
Flags: -O2 -G0 -mips2 ...   # paste the exact flags
Target function address: 0x80001234

Disassembly:
<paste disassembly>

Callers:
<paste caller list or relevant calls>

Data references:
<paste globals, rodata, jump tables>

Already-matched reference functions from the same module:
<paste 1-3 short matched functions for style>

Write the C. Do not write comments explaining the assembly. Write plausible source.
Compile it. Run objdiff. Read the diff.
Iterate until score 100 or until you have tried 25 builds.
Report the final C, the score, and the first remaining mismatch.
```

What makes the prompt work: exact compiler and flags, the actual diff feedback each round, a hard iteration cap, and reference functions for style.

What does not work: "decompile this function" with no compiler feedback. Handing the agent 20 functions at once. Matching without telling it the flags. Asking for "clean readable code" instead of byte match.

### rebrew: compiler-in-the-loop workbench

- Repo: github.com/maci0/rebrew
- License: MIT
- Requires Python 3.15+ and Linux x86_64 for the shipped compiler profiles. Windows and macOS run through Wine, DOSBox, or native runtime containers.

rebrew is a newer workbench that wraps the whole loop in one CLI. It covers:

- Function authoring with byte diffs.
- Compiler flag search.
- A genetic-algorithm matcher for permutations.
- Bounded symbolic proofs for functions where byte equality is hard to reach.
- Library identification, globals and types, data layout, whole-binary verification.
- Symbol exports for toolchains that consume them.
- Six packaged agent workflows, installed into a project as skills and AGENTS.md files.

Key commands:

```
rebrew intake /path/to/server.dll    # scaffold project, detect compiler, discover functions
rebrew doctor                        # check prerequisites
rebrew toolchain list                # show compiler profiles
rebrew todo --json                   # pick next function
rebrew test src/server/fcn_10003da0.c --json
rebrew diff src/server/fcn_10003da0.c --json
rebrew verify --compare --json
rebrew lint --json
rebrew coverage export --output snapshots/
```

rebrew's distinguishing feature is the compiler-in-loop design: it knows which compiler built the target, searches the flag space, and treats byte verdicts as the only progress metric. Match types: EXACT, RELOC (bytes match after relocation fixups), PROVEN (bounded symbolic equivalence, no byte-match credit).

Use rebrew when you want a self-contained workbench for a binary that is not part of an existing community decomp. Use decomp.me or a project repo when you want to contribute upstream.

### decomp-goal-harness: Codex-style goal loops

- Repo: github.com/Muhtasham/decomp-goal-harness
- Ships with an accepted ICML 2026 DL4C workshop paper: "Matching Decompilation as a Verifier-Guided Task for Human-Centered Coding Agents."

This harness wraps a Codex-style agent in a compile-diff-edit loop. It does not decompile by itself. It provides: target discovery ranked by agent-friendliness (`targets`), scoped goal prompts (`goal`), verifier runs (`run`), progress records and a dashboard, steering for external leads (`steer`), decompiler-output comparison (`decompilers`), and last-mile tools (`lead`, `experiments`, `variants`, `fuzz`, `coach`, `checkpoint`) for the plateau after 99 percent.

Typical setup:

```
uv sync
uv run decomp-goal doctor --repo /path/to/tww
uv run decomp-goal targets --repo /path/to/tww --rank --limit 20
uv run decomp-goal codex --repo /path/to/tww --unit src/d/actor/d_a_obj_mmrr.cpp --mode tmux --session tww-mmrr
```

The intended workflow is banteg-style: one translation unit per goal, commit only measurable improvements, classify the mismatch when stuck, and inject external leads instead of letting the agent random-walk.

### DS Decomp Studio: queue for humans and agents

- Repo: github.com/liolu/ds-decomp-studio
- License: CC0-1.0
- Stack: local web app plus CLI on top of ds-decomp, mwccarm, m2c, objdiff, and decomp-permuter.

DS Decomp Studio organizes DS matching decomps into difficulty-rated blocks of 50 functions. It runs a shared work queue where claims live in each game repo under `.studio/` and synchronize through GitHub. As of 2026-11-04 it tracked 82 DS games and about 105,126 of 680,044 functions matched.

Key commands:

```
python studio.py games
python studio.py blocks <game> --free
python studio.py claim <game> next --level 1 --who NAME --kind claude
python studio.py brief <game> <block>
python studio.py touch <game> <block> --note "func_x: missing struct type"
python studio.py done <game> <block>
python studio.py release <game> <block>
python studio.py queue
python studio.py publish <game>
```

AI integration:

- A Qwen-via-Ollama button has the local model attempt functions in a claimed block. A match is kept only if `match.py verify` passes.
- A "brief" button generates a work sheet for a block that you paste to Claude or another agent.
- The difficulty rating uses auto_match results, m2c draft compilability, and function size.

Rules the tool enforces:

- Never publish ROMs, assets, or game binaries.
- White-room only: binary plus public projects.
- No commit without `VERIFY PASSED`.
- Format with clang-format before commit. CI checks it.

### decomp.wtf: the discontinued all-in-one harness

- Repo: github.com/i12bp8/decomp.wtf
- License: MIT
- Status: discontinued October 2026. The author archived it after community opposition to AI-written decomp contributions. The code remains usable. There are no updates or fixes.

What it did: point an existing agent (Claude Code, Codex, Antigravity CLI, opencode) at a ROM you own. splat and spimdisasm find functions, each agent claims one, and every attempt compiles with the original compiler and links at the real address for a byte check. Supported N64, PS1, PS2, GameCube, Wii, GBA, DS from scratch plus forks of about 245 public decomps. Compilers are pinned and checksum-verified. IDO is not shipped. Ships a demo ROM, Demo Quest 64.

Because it is archived, treat it as a reference implementation, not a maintained dependency. Its architecture is worth reading: claims, attempts, notes, shared headers, twin-function auto-matching, background permutation of near misses, and linked-file promotion for GameCube/Wii DTK projects.

## Recompilation Projects by Console

Matching decomp aims for byte identity. Recompilation aims for a runnable port. The 2026 trend is static recompilation: translate the whole binary to C or C++ once, then build a native executable. AI helps most at the translation and cleanup stages.

### Nintendo 64

| Project | URL | Approach | AI role |
|---|---|---|---|
| N64Recomp | github.com/N64Recomp/N64Recomp | Static MIPS-to-C recompiler. About 8.3k stars. Active. | Framework-level. Generates C from the ROM. |
| Zelda64Recomp | github.com/Zelda64Recomp/Zelda64Recomp | Majora's Mask PC port built on N64Recomp. Active. | Maintainers ban GenAI contributions. Do not submit agent-written code. |
| zeldaret/oot, zeldaret/mm, zeldaret/tww | github.com/zeldaret | Matching decomps. OOT reached 100 percent. | decomp-goal-harness targets TWW units directly. |
| n64decomp org | github.com/orgs/n64decomp | sm64, mk64, GoldenEye, banjo-kazooie. Mixed status. sm64 frozen 2024. | Community projects. Check each repo's AI policy. |
| sm64pc/sm64ex | github.com/sm64pc/sm64ex | Super Mario 64 PC port from the decomp. | Active. |
| pmret/papermario | github.com/pmret/papermario | Paper Mario N64 decomp. About 100 percent US. | Active. |
| n64hub | github.com/n64hub | About 25 AI-written N64 static recomps for PC and web. New October-November 2026. Bring your own ROM. | These are the output of agent-driven recompilation. Quality unverified. |

N64 matching specifics: compiler is IDO 5.3 or 7.1 or KMC GCC 2.7.2, check the project. Splitting uses splat with a project YAML or spimdisasm. Scoring scripts usually wrap objdiff. CodeWarrior-era C dialects matter, and many N64 games used C++ with vendor extensions. Runtime-loaded and compressed code needs special handling. decomp.wtf documented TLB-loaded and compressed N64 support before archiving.

### PlayStation 1

| Project | URL | Approach |
|---|---|---|
| PSXRecomp | github.com/RetroPortingToolKit/psxrecomp | Static PS1-to-C recompiler. Part of the RetroPortingToolKit collective. |
| PCSX-Redux | github.com/pcsx-redux/pcsx-redux | PS1 emulator with REST API, Lua scripting, OpenBIOS. Used as a validation oracle for recompiled code. |
| psx projects on decomp.me | decomp.me | Several PS1 games have matching-decomp targets. |

PS1 matching specifics: GCC 2.7.2 or 2.8.1 in the PSY-Q era. MIPS I with COP0 quirks. Delay slots are explicit in assembly but invisible in C. Overlays are common. The ABI is o32 with $gp-relative addressing.

### GameCube and Wii

| Project | URL | Approach |
|---|---|---|
| decomp-toolkit | github.com/zeldaret/decomp-toolkit | The standard GC/Wii decomp framework. ninja build, objdiff scoring, DTK template projects. |
| OpenCE | github.com/OpenCommunityEdition/OpenCE | Halo: Combat Evolved PC port. Very active. |
| decomp.wtf fork mode | archived | Supported dtk-template projects with automatic file linking. |

GC/Wii matching specifics: Metrowerks CodeWarrior for GameCube or Wii, versions 1.0 through 1.7 across titles. Mostly C++ with templates, inlines, and vendor extensions. Matching is harder than N64 because C++ codegen is less predictable. "Linked" is the goal: every file's functions and data match and the whole disc rebuilds byte for byte. Dolphin is the usual runtime oracle.

### Nintendo DS

| Project | URL | Approach |
|---|---|---|
| ds-decomp | github.com/AetiasHax/ds-decomp | The DS toolchain: splitter, mwccarm build, matching verify. |
| DS Decomp Studio | github.com/liolu/ds-decomp-studio | Work queue and AI integration on top of ds-decomp. |
| Desmume / melonDS | desmume.github.io, github.com/melonDS-emu | Emulators used for runtime verification. |

DS matching specifics: ARM9 plus ARM7. Most code is ARM9, and ITCM and DTCM sections need separate handling. Compiler is mwccarm, versions 1.2 through 2.x for DS titles and up to 1.6 for DSi per decomp.wtf docs. Overlays are common. Studio data: 82 games tracked, about 15.5 percent of functions matched as of 2026-11-04.

### Nintendo Switch

| Project | URL | Approach |
|---|---|---|
| nxrecomp | github.com/drakolordx7/nxrecomp | Switch and Switch 2 recompilation framework. |
| LASRecomp | github.com/peiikai/LASRecomp | The Legend of Zelda: Link's Awakening remake, rebuilt from the Switch original. |
| SavageWindRecomp | github.com/Revivedx/SavageWindRecomp | Breath of the Wild recompilation. |
| SwitchRecomp (bgyss) | github.com/bgyss/SwitchRecomp | Spec-driven recomp research. |
| SwitchRecomp (kaiyao7) | github.com/kaiyao7/SwitchRecomp | AArch64-to-IR-to-C framework. |
| Ghidra-Switch-Loader | github.com/Adubbz/Ghidra-Switch-Loader | Ghidra loader for Switch binaries and firmware. |

Switch matching is less mature than N64 or GC/Wii: the toolchain splits between devkitPro GCC and first-party mwccarm 4.0.14, modern C++ and inlining make byte matching hard, most Switch "decomp" work is really recompilation to readable C, and the NSP format adds front-end work.

### Xbox 360

| Project | URL | Approach |
|---|---|---|
| XenonRecomp | github.com/hedge-dev/XenonRecomp | Xbox 360 to native C recompilation. |
| UnleashedRecomp | github.com/hedge-dev/UnleashedRecomp | PC port of Crackdown built on XenonRecomp. |

Xbox 360 recomp specifics: PowerPC Xenon, in-order, with VMX128 vector extensions. The original toolchain is Microsoft's Xenon compiler derived from Visual Studio. Matching decomp is rare because the compiler is poorly documented and licensed binaries are scarce. Recompilation projects sidestep matching by lifting to C and accepting behavioral equivalence.

### romdev: matching decomp in a box

- Repo: github.com/monteslu/romdev
- Install: `npx romdevtools`
- Server: http://127.0.0.1:7331, with MCP at `/mcp` and HTTP at `/tool/{name}`.
- 38 tools over MCP and plain HTTP.

romdev bundles 19 consoles' toolchains as WebAssembly. It includes:

- Build toolchains: cc65, SDCC, RGBDS, asar, GCC and binutils for m68k, ARM, MIPS, SH, SGDK, PVSnesLib, libtonc.
- Emulation cores: libretro cores as WASM for NES, SNES, Genesis, GBA, N64, PS1, Dreamcast, and more.
- Analysis: Rizin and Ghidra compiled to WASM, covering 18 platforms.
- Decomp tools: splat, spimdisasm, rabbitizer, m2c, decomp-permuter, a Python C parser.
- Matching decomp: `decomp({op})` drives splat-based N64 and PS1 projects through generate-compile-compare-permute-integrate, all in JavaScript/WASM.

romdev's matching-decomp path uses KMC GCC 2.7.2, EGCS 1.1.2, PS1 GCC 2.6.3, and mips-linux-gnu GCC as WASM. IDO is proprietary and not shipped. You must build it yourself or point `ROMDEV_IDO_DIR` at your own build.

Use romdev when you want a batteries-included environment for small or obscure platforms. Use a dedicated project repo when you want to contribute to a known decomp.

## Where AI Actually Helps

### What works

| Task | Why AI works | Evidence |
|---|---|---|
| Small functions | Under ~32 bytes of machine code, the search space is small. The model can hold the whole problem. | DS Decomp Studio rates "Portable" and "Facile" functions by size, and small functions match at high rates. |
| Boilerplate | Shared prologues, memcpy-like loops, simple getters and setters, switch dispatch tables. | decomp.wtf auto-matched 762 duplicate functions in Mario Party 6 in 12 minutes without AI. |
| First drafts | m2c and Ghidra produce compilable skeletons. The AI cleans them up. | DS Decomp Studio and decomp.wtf both use m2c drafts as the starting point. |
| Style matching | Once a project has matched functions, the AI learns the local idioms: macro names, type aliases, brace style. | Projects with strong conventions see faster agent convergence. |
| Diff interpretation | "This mismatch is a sign-extension difference" is a bounded question the model answers well. | decomp-goal-harness `lead` and `coach` commands formalize this. |
| Flag and toolchain discovery | Given a known-matched function, the AI can propose flag sets to test. | rebrew's flag search is partly automated, and the AI proposes candidates. |

### What fails

| Task | Why AI fails | Evidence |
|---|---|---|
| Large optimized functions | Register allocation and instruction scheduling in `-O2` output have huge search spaces. The model cannot simulate the compiler mentally. | Retrobench's hardest targets top out at 96.9 percent for the best model. No model reached 100 percent on the two hardest non-leaked targets. |
| Hand-written assembly | Some functions were written in assembly originally. There is no C that produces them. The project marks them `nonmatchingsrc` or `complete`. | ZeldaRET projects have explicit asm-only function lists. |
| Intrinsic-heavy code | DMA helpers, cache ops, CP15 register writes on N64/DS, and similar need inline assembly or vendor intrinsics the model does not know. | decomp.wtf agents were forbidden from inline assembly, and functions needing it stayed unmatched. |
| Cross-function invariants | A function may match only if a shared global, a type layout, or a calling convention is fixed first. The model sees one function and misses the dependency. | decomp-goal-harness added `steer` and `decompilers` commands specifically for external leads. |
| Compiler-version quirks | Old compilers have bugs and undocumented behaviors. The model knows gcc 2.7.2 in general but not KMC's exact quirks. | Flag mismatch is the most common silent failure. rebrew exists partly to search this space. |
| C++ template instantiation | GameCube/Wii code uses templates heavily. Matching a template instantiation requires knowing the exact instantiation context. | GC/Wii projects have lower agent throughput than N64 projects. |

### Benchmark evidence

Retrobench (retrobench.ai) is the cleanest public measurement of this task:

- Task: given raw MIPS assembly of an N64-era game function, write C that recompiles byte-for-byte with the original IDO-era compiler.
- Budget: 25 builds per function.
- Top scores (v0.4.x, November 2026): Claude Opus 5.5 at 98.4 mean byte-match, Fable 5.1 at 97.8, GPT-6.1 Sol at 94.9, GPT-6 Astra at 94.3, Gemini 4 Argon at 84.7, Claude Sonnet 5.5 at 84.2, GLM-5.3 at 80.2, Kimi K3 at 79.5, DeepSeek-V4.1-Flash at 75.1.
- The two hardest non-leaked targets have no proven 100 percent solution. Best scores: 99.9 percent on TEMPEST, 96.9 percent on COLOSSUS.
- Scope limits: one architecture (MIPS/IDO), five targets, undisclosed games. Generalization to PowerPC, ARM, PS1, or Switch is planned but unmeasured.

DecBench (decbench.com) measures decompilers and LLM agents on CFG distance, type correctness, and recompilation byte-match across a broader function set. Sample-set agent results: Codex with gpt-6-astra at 59.6 percent union perfect-score, Claude Code with claude-opus-4-8 at 56.8 percent. Traditional decompilers cap at 35.2 percent for Kuna, 30.8 for IDA, 26.4 for Ghidra.

The honest reading: AI is a strong junior decompiler for small and medium functions. It is not a replacement for an expert on large optimized code. The best results come from pairing the model with a deterministic oracle and a human who knows when to stop.

## Pitfalls

### Community and legal

- Read the project's contribution rules. Zelda64Recomp bans GenAI contributions. Many decomps require a human to stand behind every line. decomp.wtf never sends anything upstream for this reason.
- Do not publish decompiled code of games you do not own. Matching decomp produces copyrightable derivative works.
- Do not use leaked source code. DS Decomp Studio's rules say white-room only: the binary plus public projects.
- Do not share ROMs or extracted assets. decomp.me and the project repos host only source and build files.

### Technical

- Flag mismatch looks like a source problem. If every function scores low regardless of C quality, check the compiler and flags first.
- objdiff 100 percent is necessary but not sufficient for ROM-level matching. Literal pool order, function ordering, and data layout can still break the final link. DS Decomp Studio has `find_culprits.py` for this.
- A function can match in objdiff but break the ROM build if it changes a shared literal pool or a static initializer. Run the full ROM check before committing.
- "Equivalent" and "matched" are different statuses. Do not mark a function matched unless the project's verifier says so.
- Some functions are assembly-only by design. Do not waste agent cycles on them. Check the project's exclusion list.
- Overlays and dynamically loaded code need special handling. The function's load address matters for matching calls and jump tables.
- C++ projects need C++-aware prompting. Tell the agent the file is `.cpp`, the ABI, and the template context.

### Agent-specific

- Cap the build budget. Retrobench uses 25. Without a cap, agents thrash on impossible functions.
- Feed the diff back each round. An agent that only sees its own C and not the objdiff output cannot converge.
- Do not let the agent edit build scripts, linker scripts, or assembly files. decomp.wtf enforced this boundary and prevented whole classes of failure.
- Keep a human review gate before upstream submission. Even projects that accept AI help expect a person to verify.
- Watch for "fakematching": hacks that game the verifier without producing real source. Examples: hardcoding bytes, using inline assembly disguised as C, or patching the build to skip the check. Project rules forbid this. Check anyway.

## See Also

- [Decompiler workflow](../03-decomp/decompile-workflow.md)
- [Batch decompilation](../03-decomp/batch-decompilation.md)
- [Context engineering](../02-collab/context-engineering.md)
- [Multi-agent patterns](../02-collab/multi-agent-patterns.md)
- [Agent orchestration tools](../02-collab/agent-orchestration-tools.md)
- [SWMH auto-recomp](../04-recomp/swmh-auto-recomp.md)
- [Tool catalog](../05-tools/tool-catalog.md)
- [Firmware RE](../06-topics/firmware-iot-re.md)
- [Deobfuscation](../06-topics/deobfuscation.md)
- [Real-world recipes](../08-case-studies/real-world-recipes.md)
