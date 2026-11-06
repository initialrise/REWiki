# Recompiling Consoles, Games, and Firmware

> Tags: static-recompilation, consoles, firmware, firmware-rehosting, LLM-assisted-porting | Difficulty: intermediate–advanced | Prerequisites: read `../03-decomp/verification-loop.md` and `../06-topics/firmware-iot-re.md`

## Overview

Recompilation converts machine code from one platform into native code for another. You do not fix the output to match a known original. You run it. The goal is working software, not byte-exact matching.

This page covers three families of work:

1. Console game recompilation. Tools like N64Recomp, XenonRecomp, and the Switch recomp projects convert game executables into C or C++ you can build natively.
2. Firmware rehosting. Tools like Firmadyne successors run firmware images in QEMU or other emulators. AI-assisted pipelines like ripcord and revenant automate parts of the analysis.
3. LLM-assisted porting. Large language models translate decompiled C into portable code, generate glue, and drive the compile-fix loop.

The distinction that matters most is **reimplement versus recompile**:

| Approach | Input | Output | Goal |
|---|---|---|---|
| Recompile | Original binary | C/C++ plus a runtime | Fast native execution of the original code |
| Reimplement | Binary or documentation | New source code | Same behavior, written fresh |
| Matching decomp | Original binary | C that compiles to identical bytes | Proof of correctness, no runtime needed |

Recompile sits in the middle. The output runs like the original but does not look like it. That is what makes it the practical 2026 workflow for ports. Matching decomp is a different project with different tools. See `../03-decomp/verification-loop.md`.

## The Recompilation Landscape in 2026

The dominant console workflow is static recompilation, not byte-exact decompilation. The tool reads a game executable, emits one C or C++ function per original function, and produces an executable that runs natively.

### Active console projects

| Project | URL | Target | Status |
|---|---|---|---|
| N64Recomp | github.com/N64Recomp/N64Recomp | N64 MIPS | Active, about 8.3k stars, updated 2026-11-04 |
| Zelda64Recomp | github.com/Zelda64Recomp/Zelda64Recomp | N64, Majora's Mask | Active. Community bans GenAI contributions |
| n64decomp org | github.com/orgs/n64decomp | N64 matching decomps | Mixed. sm64 frozen 2024 |
| PSXRecomp | github.com/RetroPortingToolKit/psxrecomp | PlayStation 1 | Active, part of RetroPortingToolkit collective |
| PCSX-Redux | github.com/pcsx-redux/pcsx-redux | PS1 emulator with REST API | Active. Used as analysis oracle |
| PS2Recomp | github.com/ran-j/PS2Recomp | PlayStation 2 | Active |
| XenonRecomp | github.com/hedge-dev/XenonRecomp | Xbox 360 PowerPC | Active, about 6.7k stars |
| UnleashedRecomp | github.com/hedge-dev/UnleashedRecomp | Xbox 360, Sonic Unleashed | Active |
| LASRecomp | github.com/peiikai/LASRecomp | Switch Link's Awakening | Active, about 2.1k stars |
| SavageWindRecomp | github.com/Revivedx/SavageWindRecomp | Switch Breath of the Wild | Active |
| nxrecomp | github.com/drakolordx7/nxrecomp | Switch and Switch 2 AArch64 | New, small community, updated 2026-11-04 |
| SwitchRecomp (bgyss) | github.com/bgyss/SwitchRecomp | Switch spec-driven recomp | Research stage |
| SwitchRecomp (kaiyao7) | github.com/kaiyao7/SwitchRecomp | Switch AArch64 to IR to C | Research framework, small |
| romdev | github.com/monteslu/romdev | 19 consoles as WASM | Active. 38 MCP tools |

### Community indexes

Use these indexes to find existing projects before you start one:

- **SubmitGame/awesome-decomp-games** — github.com/SubmitGame/awesome-decomp-games — rated, auto-refreshed catalog of decomps, static recomps, source ports, engine remakes, and browser ports. About 2.9k stars.
- **recomp.fyi** — recomp.fyi — recomp project registry.
- **RetroPortingToolkit** — retroportingtoolkit.com — the collective that maintains PSXRecomp and related tools. Discord community is R.A.I.D.
- **yibie/awesome-rea** — github.com/yibie/awesome-rea — AI decomp and recomp projects.
- **heaven-hm/awesome-reverse-engineered-games** — github.com/heaven-hm/awesome-reverse-engineered-games — AI-rebuilt games case studies.
- **n64hub** — github.com/n64hub — about 25 AI-written N64 recomps, new in late 2026.

Check the index first. If someone already recompiled the game you want, join that project instead of starting from scratch.

## How Static Recompilation Works

The pattern is the same across N64, PS1, PS2, Xbox 360, and Switch:

1. Extract the executable from the game image. For N64 this means pulling the `.z64` or `.n64` ROM or extracting the ELF from a decomp project. For Xbox 360 this means extracting the XEX from the game disc image. For Switch this means obtaining the NSP or dumping the title.
2. Analyze the binary to find function boundaries, jump tables, and relocations. Most tools ship an analyzer for this.
3. Translate each function to C or C++ mechanically. No decompilation quality bar. Instructions map to literal C statements.
4. Write or reuse a runtime. The runtime provides CPU state, memory, hardware callbacks, and OS services.
5. Build and iterate. Fix missing instructions, broken jump tables, and unimplemented hardware until the game runs.

N64Recomp is the clearest example. It reads a TOML config that names the input ELF and output directory. It emits one C file per function. The runtime in N64ModernRuntime provides the N64 hardware model. Zelda64Recomp is the flagship consumer.

XenonRecomp does the same for Xbox 360 PowerPC. It emits C++ plus a `ppc_config.h` with memory region macros. It ships XenonAnalyse for jump table detection and function boundary analysis. The README states plainly: the tool provides no runtime. Making the game work is your responsibility.

Switch tools are newer. kaiyao7/SwitchRecomp is a research framework that decodes AArch64 to a typed IR then emits C. nxrecomp targets running Switch games natively on Windows x64. LASRecomp and SavageWindRecomp are game-specific projects that prove the approach works for Switch titles.

## N64Recomp: Concrete Workflow

This is the most mature and best-documented path. Use it when your target is an N64 game.

### Prerequisites

- CMake 3.20 or newer.
- A C++20 compiler. MSVC, GCC, and Clang are tested.
- An ELF file containing the game code with symbol names. The easiest source is an existing matching decomp project for that game.
- The N64ModernRuntime repository for the runtime.

### Build the recompiler

```bash
git clone --recurse-submodules https://github.com/N64Recomp/N64Recomp
cd N64Recomp
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release
```

The build uses rabbitizer for MIPS decoding, ELFIO for ELF parsing, toml11 for config, and fmtlib for output.

### Configure a target

Create a TOML file. The Zelda64Recomp project provides a working example at `us.rev1.toml` in its repository. A minimal config names the input ELF, output directory, and optional function stubs or patches.

```toml
[input]
elf = "path/to/game.elf"

[output]
dir = "build/output"
```

Run the recompiler with the TOML as the first argument. It emits one C file per function.

### Compile the output

Compile the generated C files with your platform compiler. Link against N64ModernRuntime. The runtime implements the `ctx->r4` register access pattern, memory macros, and hardware callbacks that the generated code expects.

### Iterate on patches

N64Recomp has a single-file output mode for patches. Compile a patched function into one file, link it before the full recompiler output, and the linker picks your version first. This avoids rerunning the whole recompiler for small fixes.

## XenonRecomp: Concrete Workflow

Use this when your target is an Xbox 360 game.

### Prerequisites

- The XenonRecomp and XenonAnalyse repositories.
- A way to extract the XEX executable from the game disc.
- A C++ compiler. Clang is recommended because the recompiler uses Clang-specific features for function hooking.

### Steps

1. Extract the XEX from the game image.
2. Run XenonAnalyse to detect function boundaries and jump tables. It produces a TOML file with jump table entries.
3. Run XenonRecomp with a TOML config that references the XEX and the XenonAnalyse output.
4. Write the runtime. This is the hard part. You must implement Xbox 360 memory, XAM, XMA audio, and rendering callbacks.
5. Build with Clang. Use the optimization flags described in the README to shrink the output and improve frame times.

### Known limitations

- MMIO is unimplemented or partial.
- Exceptions are not supported.
- Jump table detection works for some games but not all. You may need to extend the detector.
- Vector register endianness is handled by reversing the full 16-byte vector. Instructions must account for this.

The UnleashedRecomp project shows the result. With local variable optimization, the executable shrinks by about 20 MB and frame times drop by several milliseconds.

## Switch Recompilation

Switch recompilation is less mature than N64 or Xbox 360 but actively developing.

| Tool | Approach | Readiness |
|---|---|---|
| LASRecomp | Link's Awakening specific | Working port |
| SavageWindRecomp | Breath of the Wild specific | Working port |
| kaiyao7/SwitchRecomp | AArch64 to IR to C framework | Research |
| nxrecomp | AArch64 static recompiler plus runtime | New, small community |
| bgyss/SwitchRecomp | Spec-driven recomp research | Research |

For Switch work, check SubmitGame/awesome-decomp-games and recomp.fyi first. If a game-specific project exists, extend it. If not, kaiyao7/SwitchRecomp is the most general framework available.

## Firmware Rehosting

Rehosting runs firmware outside its original hardware. This is the firmware equivalent of recompilation. You do not rewrite the firmware. You run it in an emulator with enough hardware emulation to satisfy it.

### The Firmadyne lineage

Firmadyne was the original QEMU-based firmware emulation framework. It is now legacy. Two successors dominate:

- **FirmAE** — github.com/pr0v3rbs/FirmAE — automated Linux firmware rehosting in QEMU. Docker-based. Actively used.
- **vmlinux-to-elf** — github.com/marin-m/vmlinux-to-elf — rebuilds ELF from kernel images using kallsyms. Useful when you have a raw kernel but no symbols.

### FirmAE workflow

FirmAE automates the Firmadyne process:

1. Extract the firmware image. Use binwalk, unblob, or FACT.
2. Identify the architecture and kernel version.
3. Build a QEMU image with the right machine type.
4. Inject an agent or use the built-in console.
5. Boot and interact.

```bash
git clone https://github.com/pr0v3rbs/FirmAE
cd FirmAE
docker compose up -d
```

FirmAE expects firmware images in its `images/` directory. It generates QEMU configurations automatically.

### When rehosting fails

Rehosting breaks when:

- The firmware checks for hardware that QEMU does not emulate.
- The firmware uses proprietary binaries that need patching.
- The boot process expects specific NAND or flash layouts.
- The kernel is too old or too custom for the QEMU machine type.

In these cases, you patch the firmware or write a custom QEMU machine. This is where AI assistance helps.

## AI-Assisted Firmware Analysis

Several 2026 projects use LLMs to automate firmware analysis. They fall into two patterns: agent swarms that explore the binary, and pipeline tools that build a queryable fact database.

### ripcord

ripcord — github.com/DavidClawson/ripcord — is a pipeline that turns an opaque firmware binary into a DuckDB-queryable fact warehouse. It is the most concrete example of the "database as artifact" approach.

Pipeline stages:

1. **Identify** — determine ISA, load address, chip family.
2. **Extract** — run Ghidra headless via PyGhidra to get functions, calls, blocks, xrefs, strings, pcode, and decompiled C.
3. **Recover** — find vector tables, function pointers, veneers, and registrars.
4. **Classify** — resolve peripheral register accesses against SVD files.
5. **Trace** — boot the binary in Renode and capture MMIO transcripts.

The output is Parquet tables in `build/<target>/tables/`. You query them with DuckDB or let an LLM agent query them. ripcord includes Claude Code skills that drive the pipeline.

Key principle: execution is the verification oracle. A claim about a function is confirmed by running it in Unicorn or tracing it in Renode, not by trusting the decompiler.

### revenant

revenant — github.com/DatanoiseTV/revenant — is an LLM-powered engine for abandoned hardware. It produces pin maps, device trees, peripheral inventories, and optionally clean-room reimplementations.

It runs in Docker. You mount your working folder and point it at a firmware image. It identifies the SoC, enumerates peripherals, and reconstructs the hardware interface.

Legal note: revenant is for lawful repair, interoperability, security research, and education. Do not use it to infringe copyright or circumvent protection.

### Other AI firmware tools

| Tool | URL | Technique |
|---|---|---|
| FIRMHIVE | arxiv.org/abs/2511.18438 | Recursive tree-of-agents for firmware security analysis |
| FirmAgent | github.com/vul337/FirmAgent | NDSS 2026. IDA pre-fuzzing plus QEMU rehosting plus LLM taint-to-PoC |
| FirmLLM | github.com/zhang-xr/FirmLLM | Multi-agent firmware collection and analysis |
| HexGraph | github.com/branover/hexgraph | Sandboxed agentic vulnerability-research platform |
| binary-re | github.com/2389-research/binary-re | Claude plugin for ARM/ELF RE |

## LLM-Assisted Porting

LLMs help in three places in the recompilation workflow:

### 1. Translating decompiled C to portable C

Decompiled C from Ghidra or IDA is correct but ugly. It uses platform-specific types, undefined behavior, and helper functions. LLMs translate it to clean C that compiles on your target.

Prompt pattern:

```
Here is decompiled C from an N64 MIPS binary. Translate it to portable C11.
Preserve exact semantics. Do not optimize. Flag any undefined behavior.

<function>
```

For byte-exact work, use the verification loop in `../03-decomp/verification-loop.md`. For recompilation, you only need it to run correctly.

### 2. Generating runtime glue

The recompiler output needs a runtime. LLMs generate the glue code: memory accessors, hardware callbacks, OS service stubs. Give the model the recompiler output header and the target platform API.

### 3. Driving the compile-fix loop

Recompiled output rarely compiles cleanly on the first try. Feed compiler errors back to the LLM. This is the same loop as `../03-decomp/batch-decompilation.md` but with "does it run" as the oracle instead of "does it match".

Case study: the Tomba! PS1 recomp used Claude Opus plus Ghidra plus PCSX-Redux to build a MIPS-to-C++ recompiler in about three weeks. The workflow shifted from task-level prompting to goal-level prompting, with attract-demo determinism as the validation oracle. Source: 1379.tech.

## Step-by-Step: Firmware Rehosting with ripcord

This is the most concrete AI-assisted firmware workflow available in 2026.

1. Get the firmware binary. Extract it from the device or download it from the vendor.
2. Clone ripcord: `git clone https://github.com/DavidClawson/ripcord`
3. Run the identify script: `python scripts/identify.py firmware.bin`
4. Run the Ghidra extraction stage. This requires PyGhidra and a JDK.
5. Run the recover and classify stages.
6. Boot the binary in Renode to capture MMIO traces.
7. Query the resulting DuckDB warehouse.

For LLM-driven analysis, use the included Claude Code skills. The skills know how to query the warehouse and propose hypotheses.

## Pitfalls

### Recompilation pitfalls

- **Overlays break naive recompilers.** N64 games load code overlays at runtime. N64Recomp handles this with function lookups. Other tools may not.
- **Jump tables need detection.** Xbox 360 and PS2 binaries use jump tables that look like tail calls. XenonAnalyse detects some patterns. You may need to extend it.
- **No runtime means no game.** XenonRecomp explicitly provides no runtime. Budget time for runtime development.
- **GenAI contribution bans.** Some decomp projects, like Zelda64Recomp, ban AI-generated contributions. Check project rules before submitting.
- **Legal exposure.** Recompiling commercial games for redistribution is legally risky. Decomp.me and similar projects operate under research exemptions. Check your jurisdiction.

### Firmware pitfalls

- **Encrypted firmware.** Many devices encrypt firmware at rest. You need the key before analysis.
- **Proprietary hardware.** FPGAs and custom ASICs have no documentation. You must infer behavior from MMIO traces.
- **Rehosting fragility.** QEMU machine types are incomplete. Expect to patch firmware or write custom machine models.
- **Execution oracle gaps.** ripcord's Renode traces only cover what Renode can emulate. Coverage gaps mean unverified claims.

### LLM pitfalls

- **Hallucinated hardware.** LLMs invent peripheral register names. Always verify against SVD files or datasheets.
- **Context window limits.** Large binaries exceed context windows. Use the fact warehouse pattern to query only what you need.
- **Unverified claims.** Mark LLM output as unverified until execution confirms it. ripcord's principle applies to all AI-assisted RE.

## See Also

- `../03-decomp/verification-loop.md` — matching decomp verification
- `../03-decomp/batch-decompilation.md` — LLM-assisted decompilation
- `../06-topics/firmware-iot-re.md` — firmware extraction tools
- `./firmware-recomp.md` — QEMU rehosting guide
- `../05-tools/mcp-catalog.md` — Ghidra MCP integration
- `../05-tools/tool-catalog.md` — radare2 and rizin
- `../05-tools/mcp-catalog.md` — MCP server catalog
- `../05-tools/skills-catalog.md` — awesome lists and registries
