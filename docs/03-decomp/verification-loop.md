# The Verification Loop: How to Trust AI Output

> Tags: verification, hallucination, reverify, objdiff, claim-ledger, adversarial-review, z3, deterministic-oracles | Difficulty: Intermediate | Prerequisites: One decompiler or RE tool connected to an agent, a Ghidra or IDA headless environment for compile-and-diff work, threat model for prompt injection from binaries

## Overview

An agent reads your binary and writes confident analysis. Some of it is right. Some of it is invented.

Measured failure rates are high:

- SentinelOne Labs reported that half of the functions cited in agent malware reports were wrong. Several claimed capabilities were dead code from the compiler runtime library. One claimed C2 endpoint had one mangled character.
- The reverify project found that a model's textbook answers about real Windows system files were wrong 97 percent of the time. Its deterministic checker caught every wrong claim. It accepted 0 of 71.
- The NDSS 2026 study "Decompiling the Synergy" found that open-ended prompts such as "find the vulnerability" produced hallucinated buffer overflows and wasted 231 percent more time than unassisted work. This result is reported, not independently verified.

The fix is structural. Never let the model assert a fact. Let a deterministic tool decide. The model proposes. The tool checks. Only the result of the check counts.

A verification loop has four parts:

1. The agent emits claims in a machine-readable form.
2. A deterministic tool checks each claim against the binary.
3. The tool returns a verdict per claim.
4. Your notes record the verdict and the evidence.

The loop is cheap. Disassembly, byte reads, and emulation take milliseconds. The expensive part is the agent's time. Spend the deterministic tool's effort on every claim.

## How It Works

Three oracle families cover most RE verification work.

### Claim checking

The agent states a claim about the binary. A deterministic engine re-derives the answer and compares.

- reverify (github.com/2akouwu/reverify) parses PE, ELF, and Mach-O files in pure Python. It disassembles x86 and ARM. It scans byte patterns. It emulates CPU state with Unicorn. It proves claims with Z3. A claim comes back VERIFIED, REFUTED, or INCONCLUSIVE with the observed bytes attached.
- re-ground (github.com/shouvikkkk/re-ground) audits any agent's report against the binary. It is stdlib only, offline, and makes no LLM calls. It re-derives every address, string, import, endpoint, and section name. Verdicts are GROUNDED, MANGLED, UNGROUNDED, or UNSUPPORTED.
- VerifiedIDA (github.com/SentineLabs/verified-ida) is an IDA harness for model-led RE. The model proposes evidence-linked edits. The host applies them to a candidate database and checks the result. A ledger records every operation and survives context compaction.
- vmp-reverse-skill (github.com/wul7chaos/vmp-reverse-skill) targets VMProtect-protected binaries. The LLM outputs executable assertions. Z3 returns PROVEN, REFUTED, FUZZED, or UNVERIFIED. Exit codes 0, 2, 3, and 4 map to outcomes for CI.

### Compile-and-diff

For matching decompilation, the oracle is the compiler and the byte diff.

1. The agent writes C or C++ for one function.
2. You compile it with the compiler that built the target.
3. objdiff (github.com/encounter/objdiff) diffs the compiled object against the original.
4. The function counts only when the bytes match or the diff reaches your acceptance threshold.

rebrew (github.com/maci0/rebrew) wraps this loop for game reversing. It recompiles with the target's own toolchain and compares function by function. ReverseApoc (github.com/ayrtondenner/ReverseApoc) runs unattended Claude Code sessions that match X-COM: Apocalypse functions. The driver itself compiles and compares. Nothing the session claims counts.

### Execute-and-compare

For behavior, the oracle is execution.

- Paleblood (github.com/Yharnam-Hunters/Paleblood) runs the original machine code and the C++ replacement side by side. It compares return values, registers, every byte written, and every library call. A deliberately wrong version must fail the check.
- DecompPipeline (github.com/GeneralAtrox/DecompPipeline) runs the original in an emulator and the candidate C natively. A judge emits PASS or FAIL per function.
- ripcord (github.com/DavidClawson/ripcord) treats execution as the verification oracle. Unicorn runs functions. Renode traces the firmware boot and captures MMIO traffic as ground truth. No claim becomes canonical until execution backs it.

Choose the oracle that fits the task:

| Task | Oracle | Tool |
|---|---|---|
| "What is at this address" | Byte and disassembly read | reverify, re-ground |
| "This function does X" | Emulation or symbolic proof | reverify emulate_result, vmp-reverse-skill, Z3 |
| "This C matches this function" | Compile and byte diff | objdiff, rebrew, decomp.me |
| "This rewrite behaves the same" | Side-by-side execution | Paleblood harness, DecompPipeline, Unicorn scripts |
| "This report is accurate" | Claim audit | re-ground, reverify verify |

## Step-by-Step

### Step 1: Force claims into a ledger

Do not accept prose analysis as final output. Require the agent to emit claims as JSON.

A claim ledger entry has five fields:

```json
{
  "id": "c-014",
  "type": "address",
  "claim": "sub_4012A0 is the entry point of the license check",
  "evidence": "reverify output file r-014.json",
  "status": "UNVERIFIED"
}
```

Status values:

| Status | Meaning |
|---|---|
| UNVERIFIED | The agent proposed it. No check ran yet. |
| VERIFIED | A deterministic tool confirmed it. Evidence is attached. |
| REFUTED | A deterministic tool disproved it. Record the counter-evidence. |
| INCONCLUSIVE | The tool could not decide. Static-only checks on packed code land here often. |
| GROUNDED | re-ground found the exact bytes, string, or import. |
| MANGLED | re-ground found a near match. The agent's value is corrupted, not invented. |
| UNGROUNDED | re-ground found no trace of the claim in the binary. |
| UNSUPPORTED | The binary format prevents the check. Do not guess. |
| PROVEN | Z3 proved the assertion. |
| FUZZED | Z3 timed out and fell back to differential fuzzing. Weaker than PROVEN. |

Store the ledger outside the agent's compacted context. Write it to a file the agent cannot silently edit. The VerifiedIDA pattern keeps evidence and receipts on disk for exactly this reason.

### Step 2: Check low-level claims with reverify

Install the CLI and MCP server:

```bash
pip install reverify        # pure-Python core
pip install "reverify[full]" # adds capstone, unicorn, lief, Z3
reverify backends           # show which engines are active
```

Check a structural claim against observed bytes:

```bash
reverify verify sample.bin --claim '{
  "kind": "instructions", "offset": 4096,
  "mnemonics": ["push", "mov", "sub"], "note": "function prologue"
}'
```

Check that a reconstructed routine computes what the agent claimed:

```bash
reverify verify - --claim '{
  "kind": "emulate_result", "code": "b805000000b90300000001c8c3",
  "arch": "x86", "expect_registers": {"eax": 8}
}'
```

Batch claims from a file. The CLI exits non-zero if anything is refuted, so CI can gate on it:

```bash
reverify verify sample.bin --claims-file claims.json
```

Claim kinds include `bytes_at`, `u16_at`, `u32_at`, `u64_at`, `instructions`, and `emulate_result`. Run `reverify verify --help` for the full list.

### Step 3: Audit finished reports with re-ground

After the agent writes a report, convert its claims to the re-ground JSON schema and audit:

```bash
python -m reground audit --binary sample.elf --report report-claims.json
python -m reground traps --binary sample.exe   # scan for prompt-injection strings first
```

Run `traps` before `audit`. Malware now embeds anti-AI payloads in headers and strings. Cisco Talos reported four families steering about 35 percent of automated analysis runs toward benign verdicts. Check the binary for traps before you let an agent read it deeply.

The audit exits 0 only when every claim is grounded. Exit 1 means at least one claim failed. Exit 2 is a usage error.

### Step 4: Compile and diff for matching work

For matching decompilation, the loop is mechanical:

1. Compile the candidate C with the compiler and flags that built the target.
2. Produce the relocatable object.
3. Diff it against the original object with objdiff.

In practice most matching projects use the objdiff GUI or the decomp.me web service rather than raw CLI flags. The `objdiff-cli` binary ships on the objdiff releases page. The configuration is an `objdiff.json` file that maps each function's target object and base object. See github.com/encounter/objdiff for the current schema and CLI reference. Exact CLI flags are unverified. Check the docs.

rebrew automates the loop for you:

```bash
rebrew intake /path/to/server.dll
rebrew test src/server/fcn_10003da0.c
rebrew diff src/server/fcn_10003da0.c
rebrew verify --compare
```

`rebrew verify` treats EXACT and RELOC as matched. PROVEN records semantic evidence under stated assumptions and earns no byte-match credit.

ReverseApoc shows the hardened version of this loop. Each attempt runs in a fresh locked-down Claude Code session. Guardrail hooks let the session edit only one file and run only three commands. The driver compiles with the original Watcom C 10.6 compiler, scores with objdiff, splices the function into an EXE copy, and checks the whole-EXE SHA-1 against the retail file. A session ends after at most 25 checks per attempt.

### Step 5: Execute and compare for behavior

For functional equivalence, run both sides on the same inputs:

- Paleblood's `tools/verify.py` runs original machine code and the C++ replacement on recorded and generated cases. It compares return values, registers, memory writes, and library calls.
- DecompPipeline's emulator-backed judge proves behavioral equivalence per function on SH-4, SH-2, PowerPC, and Xbox 360 targets.
- For a quick check without a framework, use Unicorn to run the original function, record inputs and outputs, then run the candidate the same way and diff the traces.

reverify also covers this case for ordinary source: `reverify equiv <reference> <candidate> --lang python` runs both over shared inputs and reports the first disagreement with the input and both outputs.

### Step 6: Run an adversarial second pass

Have a second agent audit the first agent's report. The SentinelOne "adversarial consensus" engine runs radare2, Ghidra, Binary Ninja, and IDA as skeptical subagents over the same sample and cross-checks their findings.

A cheap version you can run today:

1. Agent A produces the report and the claim ledger.
2. Agent B gets only the binary and the ledger. Its job is to refute every VERIFIED claim.
3. Any claim both agents derived independently is strong. Any claim only Agent A produced stays UNVERIFIED.
4. Feed Agent B's counter-evidence back to Agent A for correction.

The audit prompt matters. Ask for disproof, not confirmation:

```
You are auditing another agent's reverse-engineering report.
For each claim below, try to REFUTE it against the binary.
Do not confirm claims. Find counter-evidence: wrong addresses,
mangled strings, dead code reported as capability, invented imports.
Output a verdict per claim: CONFIRMED, REFUTED, or UNCHECKED,
with the tool output that decided it.
```

Cross-tool consensus raises confidence. SentinelOne and Maljan both use the pattern where multiple independent tools must agree before a finding is promoted. zsec.uk's production fleet reportedly keeps all findings in a `hallucinations/` directory until they pass Gates 0 through 3: the PoC compiles, reproduces, is exploitable, and works from low privilege. This gate list is reported, not independently verified.

### Step 7: Record confidence in your notes

Every note about an AI-derived finding carries a confidence field. Example:

```markdown
### sub_4012A0 — license check entry

- status: VERIFIED (reverify r-014, 2026-11-05)
- confidence: HIGH — disassembly claim checked against bytes.
  emulate_result check pending
- evidence: reverify/r-014.json, claims.json#c-014
- open: does the check run before or after the nag screen?
```

Confidence rubric:

| Level | Rule |
|---|---|
| HIGH | Deterministic tool verified the claim. Evidence file exists. |
| MEDIUM | Claim is GROUNDED but interpretation is unchecked. The bytes exist. The meaning is the agent's guess. |
| LOW | UNVERIFIED or INCONCLUSIVE. The agent proposed it. Nothing checked it. |
| REJECTED | REFUTED or UNGROUNDED. Keep the record so the agent does not re-propose it. |

A GROUNDED address with an invented purpose is MEDIUM at best. Bytes confirmed, meaning assumed. This is the most common failure mode.

## Pitfalls

### Hallucinated function names

The NDSS 2026 measurement found LLM rename accuracy of 85 percent versus human 66 percent on known algorithms, but only 57 percent versus 65 percent overall. Names are plausible, not verified. Check every auto-generated name against the function's actual behavior before you keep it.

Treat agent-generated names as UNVERIFIED claims. Rename only after you have read the function or a deterministic check supports the name.

### Plausible-but-wrong pseudocode

Decompiled pseudocode reads like real code. Models repeat its errors confidently. The NDSS BAR 2026 study reported that agents over-trust decompiler output and show training bias toward common patterns. This result is reported, not independently verified.

On obfuscated or VM-protected code the failure is worse. The vmp-reverse-skill documentation warns that Hex-Rays pseudocode cannot be trusted on obfuscated code. Trust instructions, microcode, and P-code instead.

### Claims that survive compaction

Long agent sessions compact context. Claims made early get summarized away. The summary keeps the conclusion and drops the evidence. The agent then re-asserts a refuted claim as fact.

Keep the ledger on disk. After compaction, reload the ledger and re-check every VERIFIED entry before continuing.

### Strings that attack the verifier

Binary strings can carry prompt injection. arXiv 2605.30667 reported injection strings surviving compilation, including fake decompiler output for a different target. arXiv 2607.12507 reported provenance-blind gates validating 32 of 32 false claims. Both papers are reported, not independently fetched.

Two defenses:

1. Run `reground traps` on the binary before deep analysis.
2. Keep provenance on every claim. A string that arrived as decompiler output is data, not instruction.

### Verify the verifier

A deterministic check can still be wrong if you wire it wrong. Test each oracle once with a known-bad input:

- reverify: submit a claim you know is false. Confirm it returns REFUTED.
- objdiff: diff an object against itself plus one changed byte. Confirm the diff reports the change.
- Paleblood-style harness: feed it a deliberately wrong replacement. Confirm it fails, as the project requires.
- Z3 claims: submit a false assertion. Confirm REFUTED with a counterexample.

vmp-reverse-skill ships 37 regression assertions in `selftest.sh` for exactly this reason. Copy the habit.

### Static checks cannot see runtime behavior

re-ground is static only. A claim like "decrypts the payload at runtime" is out of scope. Packed binaries degrade to UNSUPPORTED. Do not read UNSUPPORTED as a pass.

Match the oracle to the claim. Static claims get static checks. Behavioral claims need execution.

## See Also

- `decompile-workflow.md` — the agent loop this verification layer wraps
- `decomp-orchestration.md` — multi-agent decompilation orchestration
- `batch-decompilation.md` — batch matching workflows
- `../01-setup/agent-sandboxing.md` — isolating the agent from hostile binaries
- `../04-recomp/matching-decomp.md` — compile-and-diff matching workflows
- `../06-topics/malware-analysis.md` — where verification gates fit in triage
- `../07-advanced/firmware-recomp.md` — execution-oracle firmware recompilation

## Sources

- https://github.com/2akouwu/reverify — reverify claim checker and benchmark
- https://github.com/shouvikkkk/re-ground — ground-truth report auditor
- https://github.com/SentineLabs/verified-ida — evidence-anchored IDA harness
- https://github.com/encounter/objdiff — byte-diff engine for matching decomps
- https://github.com/maci0/rebrew — compiler-in-the-loop workbench
- https://github.com/ayrtondenner/ReverseApoc — unattended byte-matching with driver-side verification
- https://github.com/Yharnam-Hunters/Paleblood — functional verification against the original
- https://github.com/GeneralAtrox/DecompPipeline — emulator-backed behavioral judge
- https://github.com/DavidClawson/ripcord — execution-as-oracle firmware pipeline
- https://github.com/wul7chaos/vmp-reverse-skill — Z3-verified VMProtect handler recovery
- https://www.sentinelone.com/labs/building-an-adversarial-consensus-engine-multi-agent-llms-for-automated-malware-analysis/ — adversarial consensus engine
- https://arxiv.org/abs/2605.30667 — prompt injection via compiled strings (reported)
- https://arxiv.org/abs/2607.12507 — representation confusion in provenance-blind gates (reported)
- NDSS 2026 "Decompiling the Synergy" — novice comprehension study and hallucination cost measurement (reported, paper not independently fetched)
- NDSS BAR 2026 — decompiler over-trust and training bias (reported, not independently fetched)
