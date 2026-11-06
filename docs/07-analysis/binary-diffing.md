# Binary Diffing and Function Matching

> Tags: bindiff, patch-diffing, version-tracking, diaphora, ghidriff, bsim, function-matching, n-day | Difficulty: Intermediate | Prerequisites: A decompiler (IDA, Ghidra, or Binary Ninja), two builds of the same program, basic familiarity with call graphs and control-flow graphs

## Overview

Binary diffing answers one question: what changed between two builds of the same program?

It is the standard tool for four jobs:

- Patch diffing. Find the exact function a vendor fixed. This is the first step of n-day hunting.
- Malware family attribution. Match functions across samples that share code.
- Version comparison. Port your annotations and renamed symbols from an old build to a new one.
- Vulnerability research. Track a patch across a product line, or prove that two binaries contain the same bug.

The matching problem is the core. A diff tool pairs each function in the old binary with its counterpart in the new binary. It then reports added, deleted, and modified functions. The quality of the diff depends almost entirely on the quality of the matching.

Classical diff tools use deterministic matchers. They score function pairs on constants, strings, call-graph shape, instruction mnemonics, and structural graphs. Modern tools add learned or LLM-assisted layers. The deterministic matchers still do most of the work. The LLM layer names functions, summarizes changes, and ranks what to read first.

## How It Works

### The matching problem

Two functions are "the same" if they implement the same logic across two builds. Code changes between builds:

- The compiler version changes. Register allocation shifts.
- Optimization level changes. Inlining and unrolling change the instruction stream.
- Addresses change. Every absolute reference moves.
- Small source edits change only part of a function.

A good matcher must be invariant to these changes. It must also be precise. A wrong match produces a false diff. A missed match produces a false added or deleted function.

### Signal families

Matchers fall into a few families. Tools combine several families and score the results.

| Signal family | What it uses | Robust to | Breaks on |
|---|---|---|---|
| Exact bytes / instructions | Raw bytes or mnemonic stream | Nothing | Any recompile or optimization change |
| Constants and strings | Literal values, referenced strings | Recompiles | String obfuscation, encryption, version bumps |
| Call graph | Caller and callee sets, graph shape | Instruction-level edits | Inlining, function splitting, heavy optimization |
| Structural graph | Control-flow graph shape | Register and address changes | Control-flow restructuring |
| Pseudo-code | Decompiler output similarity | Instruction reordering | Decompiler version changes, type recovery differences |
| Learned / ML | Trained embeddings over function features | Many compiler changes | Domain shift, packed or obfuscated code |

Diaphora combines most of these. BinDiff uses call-graph and structural features plus machine-learned ranking. Ghidra's Version Tracking uses a chain of correlators that hash symbols, exact bytes, instructions, mnemonics, and structural graphs.

### Matching algorithms in practice

BinDiff (google/bindiff) historically used a two-stage approach. Primary matching uses exact structural and call-graph features. Secondary matching uses a machine-learning model to score remaining candidate pairs. The zynamics lineage traces to Halvar Flake's 2004 paper "Structural Comparison of Executable Objects" and Thomas Dullien's 2005 paper "Graph-Based Comparison of Executable Objects" (SSTIC '05).

Diaphora (joxeankoret/diaphora) uses a similar multi-signal approach inside IDA. It computes similarity ratios from dozens of heuristics: assembly, control-flow graphs, call graphs, strings, constants, pseudo-code, and microcode. Version 3.5 is the current release as of 2026-11.

Ghidra's Version Tracking (Ghidra/Features/VersionTracking) applies a sequence of correlators to match symbols and functions between two programs. The correlators include exact-name matching, exact-bytes hashing, instruction hashing, mnemonic hashing, and structural-graph hashing. Each correlator produces candidate matches with confidence scores. The tool then applies match refinement.

FunctionID, formerly called Gemini in older Ghidra documentation, is the similarity-search plugin (Ghidra/Features/FunctionID). It computes feature vectors for functions and ranks similar functions across programs. It is closest to "find functions like this one" rather than "diff these two binaries".

BSim (Ghidra/Features/BSim) is a server-backed similarity index. It fingerprints functions with feature vectors and stores them in a database. You query it to find similar functions across many binaries. It is the closest thing in Ghidra to BinDiff's cross-binary matching at scale.

## Setup

### Diaphora

Diaphora is an IDA plugin. It is free and open source under AGPL. Commercial licenses exist for companies that cannot use AGPL.

Install with the Hex-Rays plugin manager:

```bash
hcli plugin install https://github.com/joxeankoret/diaphora/archive/refs/tags/3.5.0.zip
```

Manual install: download the repository and place it into your IDA `plugins/` directory.

Diaphora works in three phases:

1. Export. Run "Export" on each binary to produce a `.bin` file. The export captures disassembly, strings, constants, call graph, and pseudo-code.
2. Diff. Load two export files and run the diff. Diaphora matches functions and produces a match list.
3. Review. The matched pairs open side by side. You port names and comments from the old database to the new one.

The export step is slow on large binaries. Run it headless when possible:

```bash
ida -A -S"export_script.py" -Lexport.log target.exe
```

Diaphora ships `diaphora.py` scripts for batch export and diff. See the project wiki for the exact script names. They change between versions.

### BinDiff and BinExport

BinDiff is now open source (github.com/google/bindiff, Apache 2.0). The zynamics lineage continues under Google's stewardship. The companion exporter is BinExport (github.com/google/binexport).

BinExport supports IDA Pro 9.4 or higher, Binary Ninja, and Ghidra. Install the prebuilt packages from the releases pages.

Workflow:

1. Install BinExport in your disassembler.
2. Export each binary to a `.BinExport` file.
3. Run `bindiff` on the two exports.

The command-line differ produces a `.BinDiff` file and a text report. The GUI opens the report and shows matched functions side by side.

Ghidra's BinExport is an extension. Install `ghidra_BinExport.zip` via File → Install Extensions. Export with File → Export → "Binary Export (v2) for BinDiff". For headless export, run the `BinExport.java` script:

```bash
./analyzeHeadless <project_location> <project_name> \
  -process <file> -preScript BinExport.java <output.BinExport> \
  -propertiesPath <path> -noanalysis
```

Note: BinExport requires IDA Pro 9.4+. The older IDA 8.x support was dropped.

### Ghidra Version Tracking

Version Tracking is built into Ghidra. No install needed.

1. Create a Ghidra project.
2. Import both binaries.
3. Analyze both.
4. Open Tools → Version Tracking Tool.
5. Set the source program to the old binary and the destination to the new one.
6. Run the correlators.
7. Review matches in the Version Tracking window.
8. Apply matches to port symbols, comments, and types.

The correlators run in order of confidence. Symbol-name matching runs first when PDB or DWARF symbols exist. Exact-byte and instruction hashing catch unchanged functions. Structural-graph hashing catches functions that changed slightly.

For large binaries, run correlators selectively. The "Exact Bytes" correlator is fast. The "Structural Graph" correlator is slow but finds changed functions. Disable correlators you do not need.

### ghidriff

ghidriff (github.com/clearbluejar/ghidriff) is a PyGhidra-based CLI differ. It wraps Ghidra headless analysis and produces Markdown and JSON diff reports. It needs no IDA or BinDiff license.

Install:

```bash
export GHIDRA_INSTALL_DIR="/path/to/ghidra/"
pip install ghidriff
```

Or use Docker:

```bash
docker pull ghcr.io/clearbluejar/ghidriff:latest
```

Diff two binaries:

```bash
ghidriff old_binary new_binary
```

Output lands in `ghidriffs/` by default:

```
ghidriffs/
├── old-new.ghidriff.md      # Markdown diff report
├── json/old-new.ghidriff.json
├── ghidra_projects/          # Ghidra project files
└── symbols/                  # downloaded PDBs
```

Three diff engines are available:

| Engine | Method | Speed |
|---|---|---|
| SimpleDiff | Symbol names only | Fastest. Fails on stripped binaries. |
| StructualGraphDiff | Halvar Flake-style structural graph hashing | Medium. |
| VersionTrackingDiff | Ghidra correlators plus BSIM | Default. Best accuracy. |

VersionTrackingDiff is the default. It runs correlators including SymbolsHash, ExactBytesFunctionHasher, ExactInstructionsFunctionHasher, StructuralGraphHash, and SigCallingCalledHasher. BSIM correlation is on by default. Use `--no-bsim` to disable it for speed.

For a full Windows kernel diff, the README reports the tool completes in under a minute after Ghidra analysis finishes. Analysis itself takes much longer. The README's ntoskrnl example shows about 1350 seconds per binary for analysis on their hardware.

The Markdown output highlights changed functions and includes decompiler diffs. It is designed for review in a browser or pasted into a report.

### patchdiff

patchdiff (github.com/AmerMrkaljevic/patchdiff) is a lighter-weight alternative. It uses Ghidra headless to extract decompiled functions, then a pure-Python differ matches them by name or structural fingerprint and ranks changes by security relevance.

Install:

```bash
export GHIDRA_HOME=/path/to/ghidra_11.3.2_PUBLIC
./patchdiff.sh vulnerable_build patched_build
```

It produces a ranked list of changed functions with a security score. Scores come from pattern matching on the decompiled diff: changed bound literals, changed memcpy-family arguments, new allocations or conditionals.

patchdiff is a lead generator, not a complete diff tool. Its matching is conservative: ambiguous structural buckets are left unmatched rather than guessed. It works best when you have symbols or when builds are similar.

## Step-by-Step

### Diff a vendor patch

The standard n-day workflow:

1. Obtain the vulnerable and patched binaries. For Windows drivers and system files, Microsoft symbol servers host both versions. The ghidriff README shows the pattern:

   ```bash
   wget https://msdl.microsoft.com/download/symbols/clfs.sys/9848245C6f000/clfs.sys \
     -O clfs.sys.vuln
   wget https://msdl.microsoft.com/download/symbols/clfs.sys/D929C6E56f000/clfs.sys \
     -O clfs.sys.patched
   ```

2. Run the diff tool. For ghidriff:

   ```bash
   ghidriff clfs.sys.vuln clfs.sys.patched
   ```

3. Read the diff report. Look for functions with code changes. Ignore functions with only address or reference-count changes.

4. For each changed function, read the decompiled diff. Determine what the patch does.

5. Assess exploitability. Did the patch add a bounds check? Did it change a size calculation? Did it fix a use-after-free?

The ghidriff README demonstrates this on CVE-2023-21768 (afd.sys). The diff identified `AfdNotifyRemoveIoCompletion` with a single-line change. The vulnerable and patched builds matched 12 functions, 1 of which changed.

### Port symbols to a new version

When a vendor ships a new build and you have an annotated old build:

1. Run Diaphora or BinDiff between the two versions.
2. Review the match list. Fix any false matches manually.
3. Use the tool's symbol-porting feature. Diaphora can port names, comments, structs, enums, and typedefs. BinDiff ports names and comments.
4. Verify a sample of ported names before trusting the batch.

### Attribute a malware family

For malware samples that share code:

1. Diff two samples with Diaphora or BinDiff.
2. Look at the matched-function ratio. A high ratio suggests shared lineage.
3. Check which functions changed. Changes often indicate configuration, anti-analysis updates, or payload swaps.
4. Use unmatched functions to find unique capabilities.

BinDiff was designed for this use case. Diaphora's call-graph matching helps when samples are packed differently but share the same core.

### Track a patch across a product line

When one CVE affects multiple products:

1. Diff the patched and unpatched versions of each product.
2. Collect the changed-function signatures.
3. Compare across products. Similar patches indicate shared code ancestry.

### Use ML-based matching

Ghidra's FunctionID and BSim provide similarity search rather than pairwise diff. Use them when:

- You have many binaries and want to find all instances of a known function.
- You want to track a function across versions without running a full diff.
- You are building a function database for repeated queries.

BSim requires a server. The NSA published the server code but it is non-trivial to deploy. For small collections, FunctionID's local search is simpler.

BinDiff's machine-learning component scores candidate matches that deterministic matchers could not resolve. This helps on stripped binaries where call-graph signals are weak.

## LLM-Assisted Diffing

The deterministic matchers produce a match list and a set of changed functions. The LLM layer helps after that.

### Naming matched functions

When you port symbols from an old build to a new one, some functions have no name. The LLM can propose names based on the decompiled pseudo-code.

Workflow:

1. Export the decompiled pseudo-code for unmatched functions.
2. Send each function to an LLM with a prompt like:

   ```
   Name this function based on its behavior. Output one line:
   name: <snake_case_name>
   confidence: <0-100>
   reason: <one sentence>

   <pasted pseudo-code>
   ```

3. Check names against the function's actual behavior. The NDSS 2026 study found LLM rename accuracy of 85 percent on known algorithms but only 57 percent overall. Names are plausible, not verified.

4. Apply names only after review.

For batch naming, process functions in chunks of 10-20. Larger batches reduce accuracy. Keep the prompt focused on behavior, not structure.

### Summarizing diffs

The diff report lists changed functions. The LLM summarizes what changed across the whole patch.

Prompt pattern:

```
You are analyzing a binary diff between version A and version B.
Below are the changed functions with their decompiled pseudo-code diffs.

For each function:
1. Describe what changed in one sentence.
2. Classify the change: bugfix, feature, refactor, or unknown.
3. Flag any changes that look security-relevant.

Output as a table.
```

Feed the output through your verification loop. The LLM's summary is a hypothesis. Read the actual decompiled diff before acting on it.

### Ranking changed functions

For large patches with hundreds of changed functions, rank by likely security impact. patchdiff does this deterministically with pattern matching. An LLM can do it semantically:

```
Rank these changed functions by security relevance.
Consider: bounds checks, integer overflows, memory safety,
cryptographic changes, authentication logic.
Output: rank, function name, one-line reason.
```

The LLM catches semantic changes that pattern matching misses. It also hallucinates. Cross-check its top picks against the actual diffs.

### Detecting injected or tampered patches

For supply-chain analysis, diff a vendor's patch against expectations. An LLM can flag suspicious changes:

- New imports of unusual libraries.
- Changes to certificate validation or signature checks.
- Added network calls to unexpected domains.
- Modified cryptographic constants.

This is reported practice, not a standardized technique. Verify every flag manually.

## Pitfalls

### Matching failures on stripped binaries

Stripped binaries have no symbol names. Matchers rely on constants, strings, and structure. These signals weaken when:

- The binary is packed or obfuscated.
- The compiler version changes significantly.
- Optimization levels differ between builds.

Diaphora and BinDiff handle this better than patchdiff. ghidriff's VersionTrackingDiff is competitive. SimpleDiff fails completely.

### False positives from compiler noise

Even a recompile with the same source produces instruction-level changes. Matchers that rely on exact bytes or instructions will report false diffs.

Mitigation: use structural or pseudo-code matching for functions that exact matchers miss. Review the diff report's "modified" list carefully. Many entries are compiler noise, not real changes.

### Decompiler version differences

Ghidra's decompiler output changes between versions. A function decompiled in Ghidra 11.0 may look different in Ghidra 12.2. This affects pseudo-code-based matching and LLM summarization.

Use the same Ghidra version for both binaries in a diff. If you must mix versions, rely on structural matchers rather than pseudo-code comparison.

### Scale limits

Diffing full operating-system kernels takes hours. The ghidriff README's ntoskrnl example shows 1350 seconds per binary for Ghidra analysis alone. The diff itself took under a minute.

For very large binaries:

- Use symbols when available. PDB or DWARF symbols make matching trivial.
- Restrict analysis to sections of interest.
- Use `--min-func-len` in ghidriff to skip tiny functions.
- Run correlators selectively in Ghidra Version Tracking.

### LLM hallucination in summaries

The LLM will invent plausible-sounding changes that are not in the diff. It will miss subtle changes. It will confidently misclassify bug fixes as refactors.

Treat LLM output as a reading guide, not a finding. Every claim needs verification against the actual decompiled code.

### AGPL and licensing

Diaphora is AGPL. Using it in a commercial product or service may require a commercial license. Check the license terms before deploying.

BinDiff and BinExport are Apache 2.0. ghidriff's license is not clearly stated in the README. Check the repository for the LICENSE file.

## See Also

- `../03-decomp/triage-and-mapping.md` — initial binary analysis before diffing
- `../03-decomp/decompile-workflow.md` — decompilation workflow
- `../03-decomp/verification-loop.md` — verifying LLM and tool output
- `../06-topics/malware-analysis.md` — malware triage and family attribution
- `../06-topics/packed-binaries.md` — unpacking before diffing
- `../07-advanced/anti-analysis.md` — anti-analysis techniques that break diffing
- `../09-ops/daily-workflows.md` — integrating diffing into daily RE work
- `../99-meta/glossary.md` — terms used in this page

## Sources

- https://github.com/joxeankoret/diaphora — Diaphora IDA plugin, version 3.5
- https://github.com/google/bindiff — BinDiff source, open-sourced by Google
- https://github.com/google/binexport — BinExport exporter for IDA, Binary Ninja, Ghidra
- https://github.com/NationalSecurityAgency/ghidra/tree/master/Ghidra/Features/VersionTracking — Ghidra Version Tracking source
- https://github.com/NationalSecurityAgency/ghidra/tree/master/Ghidra/Features/FunctionID — Ghidra FunctionID (formerly Gemini)
- https://github.com/NationalSecurityAgency/ghidra/tree/master/Ghidra/Features/BSim — Ghidra BSim similarity index
- https://github.com/clearbluejar/ghidriff — ghidriff CLI binary differ
- https://github.com/AmerMrkaljevic/patchdiff — patchdiff security-ranked patch differ
- Halvar Flake, "Structural Comparison of Executable Objects," DIMVA 2004
- Thomas Dullien and Rolf Rolles, "Graph-Based Comparison of Executable Objects," SSTIC 2005
