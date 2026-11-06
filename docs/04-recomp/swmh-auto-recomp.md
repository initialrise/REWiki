# Automated Recompilation (Static Recompilers)

> Tags: recompilation | consoles | ports | LLM-assisted | native | Difficulty: Advanced | Prerequisites: CPU architecture knowledge, C/C++, guest OS concepts, a legally obtained game dump

## Overview

A static recompiler reads a guest binary once at build time. It emits C or C++ that models every guest instruction literally. You then compile that output with a host compiler. The result is a native executable. No per-instruction interpreter sits on the hot path.

This is different from decompilation. A decompilation project writes human-readable source that recompiles byte-for-byte with the original compiler. Tools like objdiff verify that goal. A static recompilation project accepts generated, unreadable code. The goal is functional equivalence at near-native speed, not byte identity.

In 2026 the dominant console porting workflow is static recompilation. Matching decompilation still matters for preservation. Recompilation matters for playable ports. See `./matching-decomp.md` for the byte-exact workflow.

LLMs fit this space in a specific way. They do not replace the recompiler. They help you write the runtime services, name functions, recover structures, and debug behavioral differences against an emulator. The recompiler and the host compiler remain the correctness oracle.

## How It Works

### The pipeline

1. Extract the guest code. Most tools want an ELF. For a raw ROM or XEX you first carve out the executable sections.
2. Run the recompiler. It decodes guest instructions and emits one C or C++ function per guest function.
3. Build the generated code with clang, gcc, or MSVC.
4. Link it against a runtime. The runtime provides guest memory, MMIO handlers, threads, and OS services.
5. Run the game. Compare behavior against a reference emulator.

### What the generated code looks like

The translation is literal. N64Recomp turns `addiu $r4, $r4, 0x20` into `ctx->r4 = ADD32(ctx->r4, 0x20);`. XenonRecomp passes the PPC register state as an argument to every function. PSXRecomp emits dispatch tables and MMIO handlers. The output is machine-made. You do not read it for pleasure.

### The runtime problem

The recompiler handles CPU instructions. The hard work is the runtime. Guest code calls BIOS functions, kernel syscalls, and hardware registers. The runtime must implement or stub all of them. XenonRecomp states this directly: it converts game code to C++ but provides no runtime. Making the game work is your responsibility. Source: github.com/hedge-dev/XenonRecomp.

Two runtime strategies exist:

| Strategy | Meaning | Example |
|---|---|---|
| HLE (high-level emulation) | Reimplement OS services as native code | Most recomp projects |
| LLE (low-level emulation) | Recompile the guest kernel itself | PSXRecomp recompiles OpenBIOS or a retail BIOS as the kernel |

PSXRecomp uses LLE-first design. The recompiled BIOS is the correctness oracle. An optional HLE tier sits on top for boot speed. Anything HLE does not implement falls through to the recompiled BIOS. Source: github.com/RetroPortingToolKit/psxrecomp.

## The Tool Landscape (2026)

| Project | Console | Source | Status |
|---|---|---|---|
| N64Recomp | Nintendo 64 (MIPS) | github.com/N64Recomp/N64Recomp | Active. About 8.3k stars per prior survey |
| Zelda64Recomp | N64 (Majora's Mask) | github.com/Zelda64Recomp/Zelda64Recomp | Active showcase. Project policy bans GenAI contributions, reported |
| sm64pc/sm64ex | N64 (Super Mario 64) | github.com/sm64pc/sm64ex | Active port on recompiler base |
| XenonRecomp | Xbox 360 (PowerPC) | github.com/hedge-dev/XenonRecomp | Active. Powers UnleashedRecomp |
| UnleashedRecomp | Xbox 360 (Sonic Unleashed) | github.com/hedge-dev/UnleashedRecomp | Active showcase |
| PSXRecomp | PlayStation 1 (MIPS R3000A) | github.com/RetroPortingToolKit/psxrecomp | Beta framework with many game ports |
| PS2Recomp | PlayStation 2 (R5900) | github.com/ran-j/PS2Recomp | Experimental |
| nxrecomp | Switch and Switch 2 (AArch64) | github.com/drakolordx7/nxrecomp | Early. Boots Metroid Prime Remastered to first level |
| LASRecomp | Switch (Link's Awakening) | github.com/peiikai/LASRecomp | Active port |
| SavageWindRecomp | Switch (Breath of the Wild) | github.com/Revivedx/SavageWindRecomp | Active port |
| SwitchRecomp (bgyss) | Switch | github.com/bgyss/SwitchRecomp | Draft specification set with Rust scaffolding |
| SwitchRecomp (kaiyao7) | Switch (AArch64) | github.com/kaiyao7/SwitchRecomp | Research skeleton. No commercial game runs |
| romdev | 19 consoles to WASM | github.com/monteslu/romdev | Active. 38 MCP tools, reported |

Notes on specific claims:

- N64Recomp requires a TOML config and ELF metadata input. It emits one C file per function. RSP microcode support exists. Source: N64Recomp README.
- Zelda64Recomp bans GenAI contributions. Check project policy before you submit AI-written code. Reported from project documentation.
- nxrecomp checks recompiled output against Unicorn instruction by instruction. That is a rare built-in verification step. Source: nxrecomp README.
- PS2Recomp supports MMI and VU0 macro instructions but documents very bad VU and GS performance. Hardware emulation is partial. Source: PS2Recomp README.
- Switch recompilation is the least mature area. nxrecomp is furthest along for a real game target. kaiyao7's SwitchRecomp is a research skeleton with 260+ tests but no game.

### Eden and suyu

Eden is a Nintendo Switch emulator fork descended from yuzu. It reimplements the GPU and removes Nintendo's encrypted modules. It is an emulator, not a static recompiler. suyu is the renamed continuation of the yuzu project. Neither produces C++ ports of game code. If a source claims "Eden recompilation" for Switch, treat it as unverified.

### Mario Kart World-style projects

"Mario Kart 64 World" is a fan remake project built in modern C++ rather than decompiled. Whether it uses static recompilation or clean-room reimplementation is unverified. Report it as a related genre: modern-engine fan projects that borrow recomp output or runtime services. Check each project's repository before citing a technique.

## Usage

### N64Recomp workflow

Prerequisites: CMake 3.20+, a C++20 compiler, git submodules.

```bash
git clone --recurse-submodules https://github.com/N64Recomp/N64Recomp.git
cd N64Recomp
cmake -S . -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build
```

Then configure a TOML file pointing at the game ELF and output directory. See the Zelda64Recomp `us.rev1.toml` for a real example: github.com/Mr-Wiseguy/Zelda64Recomp/blob/dev/us.rev1.toml. The TOML supports stubs, function skips, and single-instruction patches.

The output links against N64ModernRuntime: github.com/N64Recomp/N64ModernRuntime. Zelda64Recomp shows a full game integration.

### XenonRecomp workflow

Prerequisites: CMake 3.20+, Clang 18+. Other compilers are not recommended. The output relies on Clang intrinsics.

```bash
git clone --recurse-submodules https://github.com/hedge-dev/XenonRecomp.git
```

Two tools exist:

```bash
XenonAnalyse game.xex jump_tables.toml   # detect jump tables
XenonRecomp config.toml ppc_context.h    # emit C++
```

The TOML requires restore/save function addresses for the MSVC-generated prologue/epilogue helpers. XenonAnalyse detects jump tables per game. Variation between compiler versions means you may need manual `functions = [...]` boundaries. Example config: github.com/hedge-dev/UnleashedRecomp/blob/main/UnleashedRecompLib/config/SWA.toml.

UnleashedRecomp is the reference runtime. Enabling the local-variable optimizations cuts about 20 MB of binary size and several milliseconds of frame time, per the XenonRecomp README.

### PSXRecomp workflow

PSXRecomp is a framework, not a single game tool. New game projects scaffold from a template.

```bash
git clone --recurse-submodules https://github.com/RetroPortingToolKit/psxrecomp.git
cd psxrecomp
cmake -S recompiler -B recompiler/build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build recompiler/build
bash tools/regen_bios.sh --config bios/OpenBIOS.toml
cmake -S runtime -B runtime/build -G Ninja -DCMAKE_BUILD_TYPE=Release -DPSX_RECOMP_UI=OFF
cmake --build runtime/build --target psx-runtime
```

For a game project, run `tools/new_project_layout/setup_project.sh --disc game.cue --dir ~/src`. It prompts for paths and generates the project. Build with the generated `build.sh`. A retail BIOS dump is optional. OpenBIOS is bundled under MIT license.

Overlay handling is the distinctive PSXRecomp feature. Games stream code from disc into RAM. The framework captures overlays at runtime, recompiles them to native shards, and caches them in `overlay_captures.json`. Coverage grows as players reach new areas.

### PS2Recomp workflow

```bash
git clone --recurse-submodules https://github.com/ran-j/PS2Recomp.git
cd PS2Recomp
cmake -S . -B out/build
cmake --build out/build --config Debug
```

For stripped retail ELFs, export function boundaries from Ghidra first:

```bash
# In Ghidra: run ps2xRecomp/tools/ghidra/ExportPS2Functions.java
./ps2_recomp config.toml
```

The generated output links `ps2xRuntime`, which provides memory, syscall dispatch, and stubs. Use `handler@0xADDRESS` stub bindings for stripped functions. `ret0`, `ret1`, `reta0` are triage handlers.

### nxrecomp workflow

nxrecomp targets Windows x64 output for Switch AArch64 games. The Metroid Prime Remastered recomp is the reference project: github.com/drakolordx7/MetroidPrimeRemasteredRecomp. The runtime covers Horizon SVC/IPC, threads, and an NVN-to-Vulkan front end. Status is early. Expect gaps.

## Where LLMs Help

The recompiler is deterministic. The LLM assists at the edges.

### Runtime service implementation

Guest OS calls arrive as stubs or syscalls. An LLM can draft the native implementation from emulator source or documentation. Feed it the HLE signature and the reference emulator's handler. Example prompt:

```
Implement sceSifCallRpc for the PS2 runtime.
Reference: PCSX2's SIF handling in pcsx2/R5900.cpp and IopBios.
Guest ABI: r3-r7 args, return in v0/v1.
Constraints: must be thread-safe, must not block the EE thread.
Output: C++ matching ps2xRuntime's syscall handler signature.
```

Verify against the emulator. Do not trust the draft.

### Function naming and structure recovery

Generated functions are named `sub_XXXXXXXX`. Feed the agent the guest disassembly plus callers. Ask for a semantic name and struct layout. This is the same loop as matching decomp, minus the byte-match requirement. See `../03-decomp/batch-decompilation.md`.

### Jump table and boundary analysis

XenonAnalyse detects jump tables per game. When detection fails, the TOML accepts manual `functions` boundaries. An LLM can scan the disassembly for `mtctr`/`bctr` patterns and propose boundaries. XenonRecomp documents this failure mode for compiler-version variants.

### Bug triage from crashes

Recomp crashes produce native stack traces with `sub_` names. Map the address back to the guest function, pull the guest disassembly, and ask the agent what the code does. This is faster than manual reading for unfamiliar architectures.

### Overlay and patch management

PSXRecomp's overlay captures need curation. An agent can classify which overlays belong to which game area, name them, and propose sharding recipes. The AOT sharding guide at `docs/AOT_SHARDING.md` describes the workflow.

### What LLMs cannot do

- They cannot verify timing accuracy. Cycle-level bugs need differential testing against the emulator.
- They cannot recover copyrighted assets. The agent works on code you legally possess.
- They should not generate the recompiler itself for production ports. The community distrusts unreviewed AI-generated recompilers. PSXRecomp accepts AI-assisted contributions but requires review.

## Patch Management

Recomp projects patch at three levels:

| Level | Mechanism | Example |
|---|---|---|
| Instruction patch | TOML `patches.instructions` or `[[patches.func]]` | Replace one guest instruction |
| Function hook | Mid-asm hooks or weak-symbol override | XenonRecomp `[[midasm_hook]]` |
| Runtime patch | C++ in the runtime or game override module | PS2Recomp `game_overrides` |

N64Recomp supports single-file output mode for patches. Compile the patched functions into a static library. Link it before the original output. The linker picks your symbols first. This avoids rerunning the recompiler. See the N64Recomp README section "Single File Output Mode".

XenonRecomp hooks work through weak linking:

```cpp
PPC_FUNC_IMPL(__imp__sub_XXXXXXXX). PPC_FUNC(sub_XXXXXXXX)
{
    __imp__sub_XXXXXXXX(ctx, base). }
```

PSXRecomp mods are versioned `.psxmod` packages. They use guarded byte patches against known disc hashes. A mod never rewrites the player's disc image. The format supports `[[patch]]`, `[[overlay]]`, and `[[plugin]]` entries. Full schema: `docs/MOD_PACKAGES.md` in the psxrecomp repo.

Keep patches in a separate directory per game. Track the recompiler version and input hash in a manifest. When the recompiler updates, regenerate and diff the patch applicability.

## Performance vs Accuracy Tradeoffs

| Approach | Speed | Accuracy | Maintenance |
|---|---|---|---|
| Interpreter (emulator) | Slowest | Highest | Low |
| Dynamic recompilation (JIT) | Medium | High | Medium |
| Static recompilation | Near-native | Medium-high | High upfront |
| Matching decomp | Native | Byte-exact | Very high effort |

Static recompilation wins on speed. The generated code compiles with the same optimizations as hand-written C. XenonRecomp's local-variable optimizations show measurable frame-time gains.

Accuracy depends on the runtime, not the recompiler. The recompiler translates instructions literally. Bugs appear when:

- The runtime implements an OS service incorrectly.
- Timing assumptions differ from the original hardware.
- FPU or vector edge cases are mishandled.
- Self-modifying code or relocations are not supported.

XenonRecomp documents specific gaps: no exception support, MMIO unimplemented, XMA decoding missing, jump tables need per-game detection. PSXRecomp's overlay system handles streamed code through capture-and-compile, with interpreter fallback for genuinely self-modifying code.

The verification oracle is a reference emulator. Run the recomp output and the emulator side by side. Compare framebuffer output, memory card state, and network packets. PSXRecomp uses the "Beetle oracle" for validation. The Tomba! case study used attract-demo determinism as the oracle.

## Pitfalls

- **No runtime, no game.** XenonRecomp produces C++ but no runtime. Budget most of your time for runtime services, not recompilation.
- **Compiler lock-in.** XenonRecomp requires Clang 18+. Other compilers may break on intrinsics. Check each tool's README.
- **Per-game analysis.** Jump tables, function boundaries, and register save/restore addresses vary by compiler version. Expect manual TOML work per title.
- **Overlay complexity.** PS1 and N64 games stream code. Pure static recompilation cannot see overlays at build time. PSXRecomp's capture-and-compile approach is the current answer.
- **Self-modifying code.** PSXRecomp documents this as an accepted permanent gap. The interpreter handles it correctly but slowly.
- **Legal exposure.** Recomp output contains translated game code. Distributing it is copyright infringement in most jurisdictions. Projects like Zelda64Recomp require you to own the game. Check local law.
- **AI policy conflicts.** Some recomp projects ban GenAI contributions. Zelda64Recomp does. Read the contributing guide before submitting generated code.
- **Verification gaps.** nxrecomp's Unicorn cross-check is rare. Most tools have no built-in correctness check. You must build differential testing.
- **Switch immaturity.** No Switch recomp runs a commercial game reliably. nxrecomp is closest. Expect to write Horizon OS services yourself.
- **Performance cliffs.** PS2Recomp warns of very bad VU and GS performance. Vector units and graphics pipelines are the hardest runtime services.

## See Also

- `./matching-decomp.md` — byte-exact decompilation workflow
- `../03-decomp/verification-loop.md` — differential testing against emulators
- `../03-decomp/batch-decompilation.md` — LLM-assisted decompilation pipeline
- `../07-advanced/firmware-recomp.md` — firmware rehosting concepts that overlap with recomp runtimes
- `../06-mobile/` — mobile RE skills that share runtime-service patterns
- https://github.com/N64Recomp/N64Recomp — N64 static recompiler
- https://github.com/hedge-dev/XenonRecomp — Xbox 360 static recompiler
- https://github.com/RetroPortingToolKit/psxrecomp — PS1 recompilation framework
- https://github.com/ran-j/PS2Recomp — PS2 static recompiler
- https://github.com/drakolordx7/nxrecomp — Switch/Switch 2 recompilation tools
- https://recomp.fyi — recompilation project registry
- https://retroportingtoolkit.com — RetroPortingToolKit community
