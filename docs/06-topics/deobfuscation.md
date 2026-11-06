# Deobfuscation: OLLVM, VMProtect, Themida, JS

> Tags: deobfuscation | VMProtect | Themida | OLLVM | JavaScript | Difficulty: Intermediate to Advanced | Prerequisites: `../05-tools/tool-catalog.md` (IDA microcode), `../03-decomp/verification-loop.md` (Z3 verification), `../02-collab/claude-code-setup.md`

## Overview

Deobfuscation is where AI helps most and proves least. The lifting and rewriting parts are mechanical. The model cannot see inside the obfuscator. It can name what it finds, restructure control flow it did not create, and check claims against a solver.

Four families of protected code appear in practice:

- Compiler obfuscators. OLLVM, Pluto, Tigress. The pass is known. The rules are finite.
- Commercial packers. VMProtect and Themida. The dispatch loop is fixed per version. The handler set is not.
- Web obfuscators. obfuscator.io, javascript-obfuscator, custom eval chains. The grammar is public.
- Managed protectors. .NET protectors like VMProtect .NET. IL-level tricks that survive decompilation.

The workflow changes per family. Native deobfuscation has two layers: transform the binary, then explain it. JavaScript has one layer: rewrite the source until it reads like source.

A useful rule: run deterministic tools first. Use the model for the parts no rule covers — renaming, structure recovery, constraint solving, and judgment calls about which dispatch path is dead.

## Setup

Install what you need before the session starts.

### Native tools

```bash
# D-810 ng (IDA Pro plugin, deobfuscates at decompile time)
git clone https://github.com/w00tzenheimer/d810-ng
cp -r d810-ng ~/.idapro/plugins/
pip3 install z3-solver   # optional, enables more rules

# deflat (angr-based OLLVM control-flow deobfuscation)
git clone https://github.com/cq674350529/deflat
# requires angr 8.19.x, tested on angr-dev virtualenv

# vmp-reverse-skill (VMProtect trace + IR + Z3 pipeline)
git clone https://github.com/wul7chaos/vmp-reverse-skill ~/.dsh/skills/vmp-reverse
bash ~/.dsh/skills/vmp-reverse/scripts/mkvenv.sh
python3 ~/.dsh/skills/vmp-reverse/scripts/doctor.py
bash ~/.dsh/skills/vmp-reverse/scripts/selftest.sh   # 37 regression assertions
```

### JavaScript tools

```bash
# webcrack (obfuscator.io, webpack unbundling)
npm install -g webcrack
webcrack input.js -o out/

# humanify (LLM-powered renaming, static binary, no Node)
curl -LO https://github.com/jehna/humanify/releases/latest/download/humanify-$(uname -m)-linux
./humanify --help
```

## How It Works

### OLLVM deobfuscation

OLLVM applies passes at compile time. The inverse work is known per pass:

| Pass | Symptom | Tool |
|---|---|---|
| Control-flow flattening | One giant switch dispatcher, all logic in cases | `cdong1012/ollvm-unflattener`, `obpo-project/obpo-plugin`, `cq674350529/deflat`, `453483289/OLLVM_Deobfuscation` |
| Bogus control flow | Dead branches with opaque predicates | D-810 rules, `overkazaf/D810G` (Ghidra, 60 MBA rules) |
| Instruction substitution | MBA arithmetic (`(x^y)+(x&y)`) | D-810, Z3-backed simplifiers |
| String encryption | Indirect loads into decoded buffers | Manual or per-binary script |

D-810 (Eshard, `gitlab.com/eshard/d810`, GitHub mirror `zhkl0228/d810`) is the most integrated option. It hooks IDA's microcode decompilation and applies rewrite rules on the microcode, not on the assembly. Load it with `Ctrl-Shift-D`. The GUI shows the active ruleset. Project rules live in JSON so you do not edit source per target.

`w00tzenheimer/d810-ng` is the maintained fork. It adds tests, refactors, and a `d810-CoBRA` backend variant (`w00tzenheimer/d810-CoBRA`). Use `-ng` unless you need exact Eshard parity.

`obpo-project/obpo-plugin` is a Hex-Rays microcode optimizer for OLLVM-CFF. The core is closed source. The plugin is open. It uploads the target function's bytes to `obpo-server` for processing. Treat that as a disclosure risk on confidential binaries.

`cq674350529/deflat` uses angr symbolic execution to recover the flat control flow. It finds the dispatcher, the pre-dispatcher, the return blocks, and the relevant blocks, then rebuilds edges. It needs the target function address:

```shell
python3 deflat.py -f samples/bin/check_passwd_x8664_flat --addr 0x400530
```

`453483289/OLLVM_Deobfuscation` targets x86-64 Linux OLLVM output.

### Lifter-based deobfuscation (remill)

The LLVM-lifter route converts machine code to LLVM IR once, then lets LLVM optimization passes do the cleanup. `lifting-bits/remill` is the canonical lifter.

```bash
git clone https://github.com/lifting-bits/remill
# build per docs/INSTALL.md; produces State, Instruction, and block lifters
```

Downstream users:

- `binsnake/omill` — lifter and deobfuscator for x86-64 Windows binaries built on remill.
- `eversinc33/MogVMP` — static VMProtect 3.0–3.5 devirtualizer. Lifts virtualized code through remill, then strips the VM layer by optimization. **Archived** as of 2026.
- `lethangomes/Remill-multi-lifter` — multi-architecture experiments.

The pattern: remill gives you LLVM bitcode. LLVM `opt` does constant folding, dead code elimination, and instruction combining that undo substitution passes. This is the same trick commercial deobfuscators use on the IR level. It works well on OLLVM because the passes are algebraic. It works poorly on VMProtect because the VM layer is a loop, not an algebraic identity.

For Pluto specifically: `bluesadi/Pluto` is an **obfuscator** (LLVM 14.0.6 based), not a deobfuscator. The project is unmaintained and points to `za233/Polaris-Obfuscator`. Do not look for a "Pluto deobfuscator" — the inverse is the same D-810 + deflat stack used for OLLVM, since Pluto borrows OLLVM-style passes. Its MBA obfuscation uses Z3-verified rewrite rules, so solver-based un-MBA tools apply.

### VMProtect

VMProtect virtualizes selected functions. The binary contains a dispatcher loop, a handler table, and bytecode. Static analysis sees the dispatcher. The bytecode handlers are the real program.

Two strategies exist:

1. **Trace-driven**: run the function, record which handlers execute, slice per handler, lift to IR, verify with Z3. This is what `wul7chaos/vmp-reverse-skill` implements.
2. **Symbolic/static**: lift the whole function including the VM, then symbolically execute through it. This is what PUSHAN, yaps, and Mergen attempt.

#### wul7chaos/vmp-reverse-skill

This is the most complete open pipeline as of 2026. It is a DeepSeek Harness skill and a standalone CLI toolchain.

Pipeline:

1. `ptrace`-based trace capture of the protected function on Linux x86-64 or ARM64.
2. Dispatcher detection. The dispatch pattern is fixed per VMP version.
3. Handler slicing along the recorded execution stream. Anchors are found at the varnode level in Ghidra P-code, not at the instruction level. Registers are matched by offset, not name.
4. Two-generation P-code IR output: raw handler IR, then a compressed semantic form for the model.
5. LLM fills in handler semantics (which handler is STORE_REG, which is ADD_IMM).
6. Z3 checks each claim. Verdicts are PROVEN / REFUTED / FUZZED / UNVERIFIED.

The skill's README states the design goal: no "I think it's equivalent" tier. Every claim is executable. Run the self-test before trusting the environment:

```bash
bash ~/.dsh/skills/vmp-reverse/scripts/selftest.sh
```

What it does not do: it does not devirtualize the whole binary automatically. It gives you a verified semantic model of one function at a time. Expect hours per function on a new VMP version.

#### PUSHAN and yaps

`arxiv.org/abs/2603.18355` (PUSHAN) is a 2026 paper on trace-free VPC-sensitive symbolic emulation for VMProtect, Themida, and Tigress-protected code. **No official artifact is public.** Treat the paper as a design reference, not a tool you can run.

`github.com/NoAddr/yaps` is an open rebuild of the PUSHAN approach. It uses SLEIGH p-code for lifting. It is AI-generated code and **Windows-only** per the project report. Expect rough edges. The value is that you can read the pipeline and adapt it.

#### Mergen

`github.com/NaC-L/Mergen` is an assembly-to-LLVM-IR lifter aimed at deobfuscation and devirtualization. It handles VMProtect 3.4 through 3.8.1 and Themida per the project README. Build instructions are in `docs/BUILDING.md`. A regression gate (`scripts/rewrite/run.cmd`) builds PE samples, runs `lifter`, and checks IR output.

Mergen's angle: once code is LLVM IR, `opt` and custom passes do the semantic cleanup. This is the remill pattern generalized. Use it when you want to devirtualize a whole module rather than one function.

#### Older tools (canonical but stale)

- `JonathanSalwan/VMProtect-devirtualization` — Triton-based symbolic execution plus LLVM lifting. The original approach. Stale but the writeup is still the best introduction.
- `can1357/NoVmp` — VTIL-based static devirtualizer. Stale.
- `aftermathlabs/vmp2` — VMProtect 2 tooling. Legacy. The author recommends newer approaches.
- `chramiq/de4vmp` — .NET VMProtect devirtualizer. Maintained-ish.
- `Aetherx86/VMP_DEVIRT` — new 2026 project. AETHER-64 plus CIA plus MBA suite. Self-reported benchmarks only. Verify before trusting.
- `jz0/tvm-devirt` — Rust devirtualizer for Tencent VM. Active, different target.

### Themida

Themida is VMProtect's competitor with a larger feature set: anti-debug, anti-dump, VM protection, and mutation. The devirtualization story is weaker than VMP's.

- `github.com/bobalkkagi/bobalkkagi` — Themida 3.x unpacking research. Devirt work is WIP. Stale-ish.
- `NoAddr/yaps` and `NaC-L/Mergen` both claim Themida coverage. yaps is trace-driven. Mergen is lift-driven.
- For Themida, start with unpacking (bobalkkagi), then treat the VM layer as a VMP problem with a different handler table.

The honest assessment: Themida devirtualization in 2026 is research-grade. Budget more time than VMP.

### JavaScript deobfuscation

JS deobfuscation is the most automatable family. The output is source you can read and diff.

Pipeline order:

1. **Unpack.** `webcrack` handles obfuscator.io output and unpacks webpack/browserify bundles. It is scope-aware and fast.
   ```bash
   webcrack bundle.js -o unpacked/
   ```
2. **Simplify.** `XingTuLab/JSIMPLIFIER` (NDSS 2026, DOI 10.14722/ndss.2026.242198) is a multi-stage pipeline: preprocessing, AST static analysis, dynamic tracing, LLM renaming. It reports 88.2 percent complexity reduction and 4x readability improvement on 44,421 samples. Optional LLM stage for identifier renaming.
3. **Rename.** `jehna/humanify` uses an LLM to suggest identifier names. The structural rewrite is done by `oxc` at the AST level, so the output is guaranteed structurally identical to the input. It is a static Rust binary with no Node dependency. Supports Anthropic, OpenRouter, Ollama.
4. **Manual passes.** `relative/synchrony` for javascript-obfuscator specifically. `ben-sb/javascript-deobfuscator` as a TypeScript alternative.
5. **Index.** `defuscator/awesome-javascript-deobfuscation` is the curated list with safety annotations. Check it when a new obfuscator appears.

`lelinhtinh/de4js` exists but is **archived**. Do not build new pipelines on it.

A working chain for a hostile sample:

```bash
webcrack hostile.js -o stage1/          # unpack + deobfuscate
# inspect stage1 output; if still obfuscated:
JSIMPLIFIER stage1/*.js -o stage2/      # multi-stage simplify
humanify stage2/app.js -o app.clean.js  # LLM rename
# diff app.clean.js against stage2 to confirm structure preserved
```

## AI's Role

Where the model adds value in deobfuscation:

- **Renaming.** Given a function full of `sub_401000`, `v5`, `a1`, the model proposes meaningful names from string references, call graphs, and constants. This is the highest-value, lowest-risk task. Verify by checking that the rename does not change semantics (it cannot, if you only rename).
- **Structure recovery.** After a deflattening tool rebuilds edges, the model can propose a higher-level loop or switch structure that matches the original source idiom. This is judgment, not proof. Mark it as such.
- **Constraint solving.** The model writes Z3 or Triton constraints from a handler's observed behavior. The solver decides. The model never decides equivalence itself.
- **Handler classification.** In VMP, the model answers "which known handler is this?" The tool validates the answer by executing both and comparing state.
- **Obfuscated predicate recognition.** MBA expressions and opaque predicates look like noise. The model can spot the algebraic identity (`(x^y)+(x&y)` is `x+y`) faster than a human reading asm, but the rewrite must still go through a solver.

Where the model must not act alone:

- Deciding that two code paths are equivalent.
- Claiming a function is deobfuscated when the tool output is partial.
- Writing the deobfuscation rules themselves without a test case.

## Step-by-Step

### Deobfuscating an OLLVM binary

1. Identify the passes. Run `r2 -A` or IDA. Look for the dispatcher loop (CFF), dead branches with constant-foldable conditions (BCF), and MBA arithmetic (substitution).
2. Try D-810-ng first. Load in IDA, `Ctrl-Shift-D`, pick the OLLVM ruleset, decompile.
3. If CFF survives, run `deflat` on the specific function:
   ```shell
   python3 deflat.py -f target --addr 0x401000
   ```
4. If you prefer Ghidra, use `overkazaf/D810G` or the `obpo-plugin` (cloud, check disclosure).
5. Have the model rename surviving `sub_*` functions using string refs and call context.
6. Verify: recompile the recovered C and diff against the original binary's decompiled output. Any semantic difference is a bug in the deobfuscation, not in the model's rename.

### Deobfuscating a VMProtect function

1. Confirm VMP version. `Detect It Easy` or `exeinfope` gives the packer signature. VMP 3.x vs 2.x changes the handler set.
2. Run `vmp-reverse-skill` doctor and selftest.
3. Capture a trace of the target function with representative inputs. The skill needs the function to execute. Pure-static VMP regions need Mergen or PUSHAN-style lifting instead.
4. Let the pipeline slice handlers and emit IR.
5. For each handler, ask the model: "this P-code fragment computes what?" The model proposes a semantic tag.
6. Run the Z3 verifier. Only PROVEN claims enter the recovered pseudocode.
7. Iterate until all handlers on the hot path are PROVEN or explicitly FUZZED.

### Deobfuscating JavaScript

1. Save the raw file. Do not edit in place.
2. `webcrack` first. Check the output for remaining obfuscation.
3. If the output is still dense, run `JSIMPLIFIER`.
4. Run `humanify` for renaming. Use `-o` to keep the original.
5. Read the result top-down. The model can summarize each function's purpose, but the deobfuscated code is the deliverable, not the summary.
6. If the sample is malware, run it in a VM or `jsdom` sandbox. Do not execute on the host.

## Pitfalls

- **D-810 is a decompiler plugin, not a binary rewriter.** It changes what you see in the decompiler view. The binary on disk is unchanged. Save your database often — the README warns that bad microcode edits can crash IDA.
- **Pluto is an obfuscator.** Searching for a Pluto deobfuscator wastes time. The inverse is the OLLVM stack.
- **PUSHAN has no public artifact.** Do not plan a workflow around running it. Read the paper for ideas, use yaps or Mergen for code.
- **yaps is AI-generated and Windows-only.** Budget time for debugging. Do not trust its output without the verification loop.
- **Mergen handles specific VMP versions.** 3.4–3.8.1 per the README. Outside that range, expect partial lifts.
- **obpo-plugin uploads your binary.** The core is closed source and the plugin sends function bytes to `obpo-server`. Do not use on classified or client-confidential work.
- **JSIMPLIFIER's 88.2% is a reported metric.** It is from the NDSS 2026 paper on their dataset. Your mileage varies on targeted samples.
- **humanify guarantees structure, not semantics.** It renames identifiers via AST. If the obfuscator hid logic in computed property names or `eval`, humanify will not recover it.
- **De4js is archived.** `lelinhtinh/de4js` is read-only. Use webcrack or JSIMPLIFIER instead.
- **Themida is harder than VMProtect.** The public tooling is thinner. Plan for manual work on the VM layer.
- **AI cannot deobfuscate what it cannot execute.** Trace-driven tools need the function to run. Anti-debug or anti-emulation checks block the trace before deobfuscation starts.

## See Also

- `../07-analysis/vm-analysis.md` — deep dive on VM anatomy, handler slicing, bytecode lifting
- `../03-decomp/verification-loop.md` — Z3 and solver-backed verification patterns
- `../05-tools/tool-catalog.md` — IDA Pro 9.x and microcode API
- `../05-tools/tool-catalog.md` — Ghidra headless and P-code
- `./packed-binaries.md` — general unpacking workflow
- `../03-decomp/verification-loop.md` — how to structure LLM claims for deterministic verification
- `../03-decomp/verification-loop.md` — Triton and angr for constraint solving
