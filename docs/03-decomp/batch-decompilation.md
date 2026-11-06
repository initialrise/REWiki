# Batch Decompilation at Scale

> Tags: decompilation, batch-processing, headless, ghidra, ida, binary-ninja, llm4decompile | Difficulty: intermediate | Prerequisites: ../03-decomp/first-decompile.md, ../01-fundamentals/headless-vs-gui.md

## Overview

Single-function decompilation with an interactive agent is fine for a crackme. It fails on firmware images, drivers, and game binaries with thousands of functions.

This page covers the batch workflow:

1. Run a decompiler headless over the whole binary.
2. Export decompiled C into files or a database.
3. Chunk the output for LLM processing.
4. Choose the right model tier for the job.
5. Estimate cost before you start.
6. Avoid the quality pitfalls that corrupt bulk output.

The core principle stays the same as in interactive work. Deterministic tools extract. The LLM refines. A verification step gates every claim.

## Setup

### Ghidra headless

Ghidra ships `analyzeHeadless` in `support/` under the install directory. It needs a JDK and a project directory.

```bash
GHIDRA=~/tools/ghidra_12.2_PUBLIC
$GHIDRA/support/analyzeHeadless ~/re-projects/batchproj \
    -import /path/to/target.bin \
    -processor "x86:LE:64:default" \
    -cspec default \
    -analysisTimeoutPerFile 600 \
    -scriptPath ~/re-scripts/ghidra \
    -postScript ExportDecompiled.java target.bin
```

A minimal GhidraScript that writes one C file per function:

```java
// ExportDecompiled.java - GhidraScript
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.*;
import java.io.*;

public class ExportDecompiled extends GhidraScript {
    public void run() throws Exception {
        DecompInterface ifc = new DecompInterface();
        ifc.openProgram(currentProgram);
        File outDir = new File(getScriptArgs()[0]);
        outDir.mkdirs();
        FunctionManager fm = currentProgram.getFunctionManager();
        for (Function f : fm.getFunctions(true)) {
            DecompileResults r = ifc.decompileFunction(f, 60, monitor);
            if (!r.decompileCompleted()) continue;
            String name = f.getName().replaceAll("[^A-Za-z0-9_.-]", "_");
            try (PrintWriter w = new PrintWriter(
                    new FileWriter(new File(outDir, f.getEntryPoint() + "_" + name + ".c")))) {
                w.println("// " + f.getEntryPoint() + "  " + f.getName());
                w.println(r.getDecompiledFunction().getC());
            }
        }
        ifc.dispose();
    }
}
```

Run it headless. Pass the output directory as the script argument:

```bash
$GHIDRA/support/analyzeHeadless ~/re-projects/batchproj batchproj \
    -process target.bin -noanalysis \
    -scriptPath ~/re-scripts/ghidra \
    -postScript ExportDecompiled.java /data/decomp/target
```

Notes:

- First run imports and analyzes. Later runs can skip import with `-process` and `-noanalysis`.
- Analysis is the slow part. Decompilation export is usually fast by comparison.
- Keep the `.gpr` project. It is the source of truth for re-runs.

For Python-side pipelines, use PyGhidra. It embeds Ghidra in CPython and removes the script-argument plumbing:

```python
import pyghidra
pyghidra.start()
from ghidra.app.decompiler import DecompInterface

with pyghidra.open_program("/path/to/target.bin") as prog:
    ifc = DecompInterface()
    ifc.openProgram(prog)
    for f in prog.getFunctionManager().getFunctions(True):
        r = ifc.decompileFunction(f, 60, prog.getMonitor())
        if r.decompileCompleted():
            pass  # write r.getDecompiledFunction().getC() to your store
```

Source: https://github.com/NationalSecurityAgency/ghidra (analyzeHeadless docs under `Ghidra/Features/Base/README.html`), https://github.com/NationalSecurityAgency/ghidra/tree/master/Ghidra/Features/PyGhidra

### IDA headless and idalib

IDA 9.x supports three headless paths:

| Path | Command shape | Notes |
|---|---|---|
| `idat64` / `ida` batch mode | `idat64 -A -S"script.py args" -Llog.txt binary` | Classic. GUI build binary in console mode. `-A` autonomous, no dialogs |
| IDALib | `import idalib` in Python 3.11+ | IDA 9.4+ required. Library, not a subprocess. Best for batch |
| Official ida-mcp | `uvx ida-hcli mcp install` | MCP bridge over idalib workers. For agent-driven batch, not pure scripts |

IDALib example:

```python
import idapro
import idalib
import ida_auto, ida_funcs, ida_hexrays

idapro.open_database("/path/to/target.bin", run_auto_analysis=True)

ida_auto.auto_wait()

out = open("/data/decomp/target.txt", "w")
for ea in idautils.Functions():  # idautils.ida_funcs.Functions()
    f = ida_funcs.get_func(ea)
    if not f:
        continue
    try:
        c = ida_hexrays.decompile(f)
    except Exception:
        continue
    if c:
        out.write(f"// {ea:#x} {ida_funcs.get_func_name(ea)}\n{str(c)}\n")
out.close()
idapro.close_database(save=False)
```

Install notes:

- Requires IDA 9.4 or later with the idalib component. Python 3.11+.
- Source: https://github.com/HexRaysSA/ida-mcp (announced September 2026, idalib workers for headless batch).
- The classic batch flags still work on `idat64`: `-A` autonomous, `-S` script, `-L` log file, `-o` output database, `-T` timeout seconds per file.
- `idalib` keeps a persistent worker model. For thousands of binaries, one worker per database is the documented pattern in community servers such as `idalib-mcp` (https://github.com/mrexodia/ida-pro-mcp).

### Binary Ninja headless

Binary Ninja has a Python API usable without the GUI. There is no separate headless binary for analysis. The same `binaryninja` module loads `.bndb` files and runs analysis.

```python
import binaryninja as bn

bv = bn.load("/path/to/target.bin")  # analysis runs on load
bv.update_analysis_and_wait()

with open("/data/decomp/target.txt", "w") as out:
    for func in bv.functions:
        try:
            hlil = func.hlil
            out.write(f"// {func.start:#x} {func.name}\n{func.name}\n")
        except Exception:
            continue
```

Export HLIL text for LLM work:

```python
for func in bv.functions:
    try:
        text = func.hlil  # str() gives HLIL; use decompiler for C-like output
        c_like = func.get_il_view(bv.arch, bn.ILType.HLIL)
        out.write(str(c_like) + "\n")
    except Exception:
        pass
```

Notes:

- Batch through `binaryninja_mcp` over stdio is documented for headless MCP use on Commercial and Ultimate editions, macOS and Linux only (https://github.com/Vector35/binaryninja-mcp). Community status of headless editions varies. Verify your license before designing around it.
- Sidekick has a Python API (`sidekick.api`) for headless pipelines on managed and on-prem deployments. Source: https://docs.sidekick.binary.ninja and https://sidekick.binary.ninja.
- Community headless server: https://github.com/mrphrazer/binary-ninja-headless-mcp (181 tools, read-only default).

## How It Works

### Export formats

Pick one store before you write scripts. Do not mix.

| Store | Shape | Good for | Bad for |
|---|---|---|---|
| One `.c` file per function | `ADDR_name.c` | LLM per-function prompts. Grep. Diff | No xref joins. No metadata |
| One `.txt` per binary | `// ea name` headers | Simple pipelines | Parsing is fragile |
| SQLite | `functions(ea, name, sig, pseudo, bytes, xrefs_json)` | Joins, filters, incremental runs | Schema work up front |
| DuckDB / Parquet | Columnar. Same schema idea | Analytics over many binaries | Same schema work |
| Fact warehouse | ripcord pattern: PyGhidra to DuckDB | Whole-corpus queries | More setup |

Minimal SQLite schema that covers most batch jobs:

```sql
CREATE TABLE functions (
    binary_id   TEXT NOT NULL,
    ea          INTEGER NOT NULL,
    name        TEXT,
    size        INTEGER,
    signature   TEXT,
    pseudocode  TEXT,
    bytes_hex   TEXT,
    calls       TEXT,          -- JSON array of callee EAs
    strings     TEXT,          -- JSON array of string refs
    PRIMARY KEY (binary_id, ea)
);
CREATE TABLE strings (
    binary_id TEXT NOT NULL,
    ea        INTEGER NOT NULL,
    text      TEXT,
    xrefs     TEXT
);
```

Store pseudocode plus callee names, not just text. Chunking by call-graph depth needs the call edges.

### Chunking strategies

| Strategy | Unit | Pros | Cons |
|---|---|---|---|
| By function | One decompiled function per LLM call | Parallelizable. Cheap per call. Easy retry | No interprocedural context |
| By module or object | All functions in one `.o` or namespace | Keeps related code together | Large outputs. Hit context limits |
| By call-graph depth | Caller plus N levels of callee summaries | Best semantic context per token | Needs call graph in the store. Summaries can drift |
| Map-reduce | Summarize leaves first, then callers | Proven pattern (GPT-WPRE) | Two passes. Summary quality gates everything |
| Hybrid | Small functions raw. Large functions summarized | Balances detail and cost | Threshold tuning |

Recommended default for 2026 batch work:

1. Store everything in SQLite.
2. Run frontier-LLM passes per function for naming and triage only.
3. For deep analysis of a target function, fetch it plus one level of callee pseudocode into one prompt.
4. Summarize callees before callers when the caller is large. This is the GPT-WPRE map-reduce pattern.

Per-function prompts are the proven cheap path. GptHidra-style pipelines do exactly this. Whole-binary prompts do not fit real binaries in context.

### Model tiers for bulk work

| Tier | Models | Use for batch |
|---|---|---|
| Specialist local | LLM4Decompile v2 (1.3B-33B), SK2Decompile, CodeInverter CIM-1.3B/6.7B | Raw assembly or Ghidra-pseudo refinement at scale. Free per token. GPU-bound |
| Open-weight large context | Kimi K3, DeepSeek V4, GLM-5.3 | Reasoning over exported pseudocode through MCP harnesses |
| Frontier API | Claude Opus 4.8, GPT-5.5/6-class, Gemini 4 | Highest quality on hard functions. Highest cost |

Specialist-model facts verified from primary sources:

- LLM4Decompile-9B-v2: 64.9 percent re-executability on Decompile-Bench, fine-tuned from Yi-Coder-9B. Refines Ghidra pseudo-code. x86-64 Linux, O0-O3. Source: https://github.com/albertan017/LLM4Decompile, arXiv 2403.05286.
- SK2Decompile (October 2025 release per repo): two-phase pipeline. Phase 1 recovers structure into an obfuscated intermediate form. Phase 2 names identifiers. Open weights on Hugging Face under LLM4Binary.
- CodeInverter (CIM): adds CFG and memory-to-data mapping context to the prompt. CIM-6.7B reports 62.05 percent re-executability on HumanEval 64-bit versus 30.94 for LLM4Decompile-6.7B. Source: https://github.com/LiuPeiP-CS/CodeInverter, arXiv 2503.07215. CID dataset: 8.69 million function samples.
- Nova (assembly-pretrained): ICLR 2025. https://github.com/lt-asset/nova.

Practical rule: specialists for volume, frontier models for judgment. Run the specialist over every function. Send only interesting or failed functions to the frontier model.

## Step-by-Step

### 1. Extract

```bash
# Ghidra
analyzeHeadless proj proj -import target.bin -postScript ExportDecompiled.java /data/decomp/target

# IDA
idat64 -A -S"export_all.py" -Lida.log target.bin

# Binary Ninja
python3 export_hlil.py target.bin > /data/decomp/target.txt
```

Write each function's output into SQLite in the same pass. Do not post-process text files later if you can store structured rows.

### 2. Index

Build the call graph and string xrefs during export. Both Ghidra and IDA expose them cheaply headless:

```python
# IDA, inside idalib script
for ea in idautils.Functions():
    f = ida_funcs.get_func(ea)
    callees = [x.frm for x in idautils.CodeRefsFrom(ea, 0)
               if ida_funcs.get_func(x.frm)]
    # store json.dumps(callees)
```

### 3. Chunk

Decide per task:

- Naming sweep: one function per call. Batch 20-50 functions per API request where the model allows.
- Deep dive: target function plus callee summaries, depth 1 or 2.
- Whole-module read: only for small modules under roughly 20k tokens of pseudocode.

### 4. Run the model pass

Frontier-model prompt shape for a single function:

```
You are renaming and annotating decompiled C from a stripped binary.
Function at 0x4012f0, called by: sub_402000, sub_403a10.
Calls: strlen, malloc, free.
Strings referenced: "usage: %s <file>", "%02x".

Pseudocode:
<decompiled C>

Return JSON only:
{"name": "...", "purpose": "...", "params": [...], "notes": "..."}
```

For specialist models, use their own prompt format. LLM4Decompile-Ref expects Ghidra pseudo-code plus the fixed task prompt from the repo. CodeInverter expects assembly plus the CFG and data-mapping blocks. Do not improvise prompts for specialists. Their training format is the interface.

### 5. Verify

Every batch job needs a deterministic gate:

- Compile-check candidate C where types allow.
- Re-executability tests on functions with known inputs (specialist models are scored this way).
- objdiff for matching-decomp targets.
- Human spot-check rate on a random sample. Track it per batch.

## Cost Estimates

Per-function cost depends on pseudocode size. Typical decompiled C runs 100-800 tokens. Call it 300 tokens average.

| Model class | Approx input+output per function | 1,000 functions | 10,000 functions |
|---|---|---|---|
| Frontier API (Opus/GPT/Gemini class) | $0.01-0.05 | $10-50 | $100-500 |
| Open-weight via API (DeepSeek/GLM/Kimi class) | $0.001-0.01 | $1-10 | $10-100 |
| Local specialist (9B on one GPU) | electricity only | hours of GPU | days of GPU |
| Local frontier-size (30B+ Qwen3-Coder) | electricity only | hours | needs a cluster |

Calibration points from measured 2026 runs:

- DecBench agent runs: about $1.0-1.2 per function for gpt-6-astra, $6.6 per function for claude-opus-4-8. These are agent runs with tool use, not bare decompile calls. Bare per-function prompts cost far less.
- SRE-Bench instances: $0.50-42.5 depending on model and effort.
- One GLM-5.2 agent run consumed $100 for 267 million tokens. Context bloat is the real cost driver, not function count.

Budget rule: cost scales with context, not binary size. A 2 MB binary with 3,000 small functions can cost less than a 200 KB binary where the agent fetches whole-module dumps. Cap tokens per call and spill large results to files.

## Pitfalls

### Truncated pseudocode

- Decompilers emit `...` or omit bodies on failure. Filter these before the LLM sees them.
- Specialist models have hard output limits. LLM4Decompile demo uses `max_new_tokens=2048` and warns the cap must stay under the model's range. Long functions truncate silently.
- Check output length against input length. A 50-line function returning 3 lines is a red flag.

### Wrong types and names

- Ghidra invents types like `undefined4`, `ulonglong`, and auto-names `FUN_00101230`. The LLM will confidently rename garbage.
- Type recovery is a separate problem from decompilation. Batch pipelines that treat renamed output as ground truth poison downstream analysis.
- Mitigate: store original auto-names alongside LLM names. Never overwrite the decompiler's name field in the database. Keep both.

### Semantic drift

- LLMs "improve" pseudocode into cleaner C that does not match the binary. This is the main quality failure mode in bulk work.
- Mitigation: ask for annotations, not rewrites, in bulk passes. Reserve rewrites for functions you will compile-test.
- DecompileBench found LLMs beat classical decompilers on readability but trail by about 52 percent on correctness. Readable is not correct.

### Context and cost blowups

- Fetching whole modules or whole call graphs saturates context windows. SentinelLABS measured compaction cutting input tokens 86 percent while degrading higher-level recovery.
- Greedy tool use burned budget on real binaries in agent benchmarks. Set per-task token budgets.
- Spill-to-file beats context stuffing. Write big outputs to disk, pass paths.

### Prompt injection through output

- Decompiled code contains strings from the binary. Strings can carry injected instructions. arXiv 2605.30667 demonstrated compiled injection strings surviving into decompiled output with high success against smaller models.
- Treat decompiled C as untrusted data in the prompt. Fence it. Do not let it issue instructions.
- Never let a batch agent write LLM-generated comments back into the IDB or Ghidra project during untrusted-binary runs. Stored injection persists.

### Batch-specific traps

- One bad function can stall a serial pipeline. Set per-function timeouts in `analyzeHeadless` (`-analysisTimeoutPerFile`) and per-call timeouts in your script.
- Decompiler failures cluster on the same constructs: switch tables, computed gotos, indirect calls, SIMD intrinsics. Track failure signatures instead of retrying blindly.
- Re-running export overwrites manual renames if you store output back into the tool database. Keep the export store separate from the analysis database.

## See Also

- ../03-decomp/verification-loop.md
- ../03-decomp/specialist-models.md
- ../03-decomp/llm4decompile-pipeline.md
- ../04-agents/mcp-batch-setup.md
- ../05-security/sandboxing.md
- ../09-cost/context-strategies.md
- ../13-workflows/game-decompilation.md
