# Multi-Agent Collaboration Patterns for RE

> Tags: agents, orchestration, mcp, cost, verification | Difficulty: Advanced | Prerequisites: `../05-tools/mcp-catalog.md`, `./context-engineering.md`, `03-decomp/verification-loop.md`

## Overview

One agent can hold the whole problem in its context. That works on small binaries.

Real binaries break single-agent workflows. The context window fills with decompiler output. The agent forgets earlier findings. It contradicts itself between sessions. Its cost grows faster than its accuracy.

The fix is to split the work across several agents. Each agent has a narrow job and a bounded context. A coordinator merges the results. A deterministic check rejects bad claims.

This page covers six collaboration patterns:

- Orchestrator-worker.
- Planner-executor-verifier.
- Debate and critique.
- Map-reduce over functions.
- Specialist swarm, one agent per binary region or format.
- Adversarial verification, where agent A claims and agent B refutes.

It also covers how REA, Kong, and Open-ReverseLab implement these patterns. It covers when parallelism helps and when it hurts. It covers token budgets and human checkpoints.

Read `../09-ops/cost-tracking.md` first if you have never tracked agent token usage.

---

## Pattern 1: Orchestrator-Worker

### How it works

One agent, the orchestrator, owns the mission. It plans the work and dispatches subtasks to worker agents. Each worker gets a scoped prompt and a tool set. The worker returns findings to the orchestrator.

The orchestrator never decompiles a function itself. It reads results, updates a shared model, and decides the next step.

### Example structure

```
User goal: "Find the license key validation in target.exe"
  |
  v
Orchestrator
  |- dispatch Triage worker    -> LIEF metadata, strings, sections
  |- dispatch Static worker    -> rizin/ghidra decompile, xrefs, search
  |- dispatch Dynamic worker   -> gdb/lldb breakpoints, register dumps
  |
  v
Shared model: observations -> hypotheses -> findings
  |
  v
Orchestrator writes the report
```

### Reference implementation

`criticic/reagent` (github.com/criticic/reagent) is a working orchestrator-worker RE agent. It defines agents as markdown files with YAML frontmatter in `agents/`.

Its structure:

| Agent | Role | Tools |
|---|---|---|
| Orchestrator | Plans, dispatches, records findings | `dispatch_subagent`, `update_model`, `shell` |
| Triage | Recon: file format, strings, sections | `file_info`, `strings`, `sections` |
| Static | Decompilation, xrefs, control flow | `disassemble`, `decompile`, `xrefs` |
| Dynamic | Runtime verification | `debug_breakpoint`, `debug_registers`, `debug_memory` |

The workers share one `BinaryModel` knowledge base. It holds three tiers:

1. Observations: raw data such as disassembly and register values.
2. Hypotheses: testable claims such as "function at 0x401230 is a CRC32 check".
3. Findings: verified facts with evidence chains and addresses.

The dynamic worker can confirm or reject a static worker's hypothesis at runtime. That is the core value of the pattern. Workers verify each other with different tools.

reagent also implements two context controls worth copying:

- `REAGENT_FAST_MODEL` points to a cheap fast model for context compaction.
- `send_dmail` sends knowledge back to a past checkpoint after a dead end. The agent restarts with hindsight instead of a polluted transcript.

### When to use it

- The goal spans multiple analysis layers (static plus dynamic plus triage).
- Different subtasks need different tool sets.
- You want one agent to keep the thread while workers do heavy lifting.

### Cost

The orchestrator adds overhead. Every worker result passes through it and consumes context. Use it for multi-hour goals, not for "rename these 20 functions".

---

## Pattern 2: Planner-Executor-Verifier

### How it works

Three roles with hard separation:

1. Planner: turns the goal into a step list. It does not touch the binary.
2. Executor: runs the steps against the binary. It proposes claims and artifacts.
3. Verifier: checks each claim with a deterministic tool. It never trusts the executor's words.

The verifier is the critical piece. It is usually not an LLM. It is a compiler, objdiff, a debugger script, or reverify-style claim checking.

### Example pipeline for matching decompilation

```
Planner:   "Decompile functions 0x1000-0x1400, compile each, diff against original"
Executor:  LLM writes C for each function
Verifier:  clang + objdiff scores the bytes; report VERIFIED or MISMATCH
Planner:   feeds mismatches back to executor with the diff output
```

### Reference implementation

Kong (github.com/amruth-sn/kong, PyPI `kong-re`) is the closest match. Its five phases run as a supervised pipeline over PyGhidra:

1. Triage: enumerate functions, classify by size, build the call graph, run signature matching.
2. Analysis: a BFS work queue sends functions to the LLM in bottom-up call-graph order. Each prompt carries the function's decompilation plus xrefs, string refs, and the already-recovered signatures of its callees.
3. Cleanup: normalize decompiler output, unify struct proposals, retry failed signature writes.
4. Synthesis: one LLM call reviews the most-connected functions and unifies naming across the binary.
5. Export: write `analysis.json` and apply names, types, and signatures back to the Ghidra database.

Kong's published benchmark: it reconstructed the CVE-2024-3094 XZ backdoor kill chain from stripped `liblzma` in about 15 minutes for about $6.63 (claimed, self-reported). Its call-graph-ordered analysis is the map-reduce idea below applied to naming.

### When to use it

- Batch jobs with a known end state: recovered symbols, matched functions, extracted IOCs.
- Any task where a deterministic artifact exists to check against.

### Key rule

The verifier must be deterministic. An LLM verifier shares the executor's failure modes. See `03-decomp/verification-loop.md`.

---

## Pattern 3: Debate and Critique

### How it works

Two or more agents argue over the same artifact. One defends a claim. The other attacks it. The output is a claim plus a refutation attempt, which a human or a deterministic gate resolves.

Debate works best when the question is judgment-heavy: "is this function a decryptor", "is this control flow flattening or a real loop", "is this string a C2 address".

### Variants

| Variant | Structure | Output |
|---|---|---|
| Claim-critique | Agent A claims. Agent B tries to refute with evidence. | Claim with status: SURVIVES, REFUTED, INCONCLUSIVE |
| Panel | N agents answer independently. Majority or judge selects. | Consensus answer plus dissent log |
| Red team | Agent A does the analysis. Agent B assumes it is wrong and hunts for the mistake. | Error list for human review |

### Reference implementation

SentinelOne's adversarial consensus engine (sentinelone.com/labs/building-an-adversarial-consensus-engine-multi-agent-llms-for-automated-malware-analysis) runs a multi-agent malware pipeline where radare2, Ghidra, Binary Ninja, and IDA-backed agents act as skeptical subagents. The report behind this wiki found that half of the function citations in agent RE reports were wrong, which is the failure mode this pattern targets.

reverify (github.com/2akouwu/reverify) implements the deterministic end of the pattern: an LLM proposes a claim about a binary, and a deterministic tool returns VERIFIED, REFUTED, or INCONCLUSIVE.

### When to use it

- High-stakes claims: exploitability, C2 infrastructure, packing verdicts.
- When you suspect the model is pattern-matching instead of analyzing.

### When it fails

Both agents can share the same wrong assumption. A debate between two instances of the same model often converges on the same hallucination. Use different models or different tools for the refuter. Maljan's cross-tool consensus pattern (see `../06-topics/malware-analysis.md`) forces agreement across independent analysis engines.

---

## Pattern 4: Map-Reduce Over Functions

### How it works

Split the binary into per-function units. Map: run a cheap pass over every function and emit a compact summary. Reduce: run a few expensive passes over the summaries, not over the raw decompilation.

This is the most important pattern for large binaries. A whole binary never fits in one context window. The map step keeps each worker's context small. The reduce step sees structure, not bytes.

### Two-level scheme

```
Level 1 (map):   decompile each function -> 3-line summary + call edges + strings
Level 2 (reduce): cluster summaries -> name groups, find entry paths, build call graph
Level 3 (verify): re-open only the functions on the critical path
```

### Concretely

Kong does this inside its analysis phase. The map is the per-function LLM call with a bounded prompt. The reduce is the synthesis phase, where one call sees the most-connected functions and unifies names. Writeback happens after each map step so callers see updated callee names.

GPT-WPRE (github.com/moyix/gpt-wpre) pioneered the same shape for naming: it summarized callees before callers so each prompt carried resolved context. Cost reference: about $16.60 for a 466-function library at 2023 davinci-003 pricing.

### Rules for the map step

- One function per call. Do not batch five decompiled functions into one prompt.
- Emit a fixed-size summary schema. Reject output that exceeds it.
- Chunk oversized functions. A 4,000-line decompiled function gets split at basic-block boundaries, summarized per chunk, then merged.
- Write results to disk immediately. Do not hold them in context.

### Rules for the reduce step

- Reduce over summaries and call edges, never over raw pseudocode.
- Cap the reduce input. If summaries exceed the window, cluster first and reduce cluster heads.
- Keep an index file that maps every summary back to its function address. Every claim needs a resolvable pointer.

See `./context-engineering.md` for compaction behavior and the VerifiedIDA ledger pattern (github.com/SentineLabs/verified-ida), which keeps evidence outside compacted context.

---

## Pattern 5: Specialist Swarm, One Agent Per Region or Format

### How it works

Assign each agent a domain it fully owns: one agent per PE section group, per protocol parser, per file format, per architecture slice.

The swarm pays off when the binary is heterogeneous. A firmware image contains a bootloader, a kernel, and a filesystem. An Electron app contains renderer JavaScript, a preload bridge, and native addons. No single agent context covers all three.

### Example: firmware

```
Orchestrator
  |- Binwalk agent       -> extracts regions, writes layout.json
  |- Kernel agent        -> vmlinux-to-elf output, config recovery
  |- Filesystem agent    -> squashfs/ext4 contents, init scripts
  |- Service agent       -> per-binary triage of /usr/sbin/*
  |
  v
Merge: cross-reference agent links findings across regions
```

The merge step is mandatory. Specialists produce local truths that contradict each other at boundaries. The cross-reference agent resolves which version of a struct is real.

### Example: Electron app

REA (github.com/morluto/rea) treats JavaScript and Electron as a first-class target. Its `analyze-javascript-application` command recovers modules, imports, IPC boundaries, and native addon relationships as separate evidence items. An agent swarm maps naturally onto that output: one worker per module group, one worker per IPC channel.

### Example: malware triage

`mrphrazer/agentic-malware-analysis` (github.com/mrphrazer/agentic-malware-analysis) uses an orchestrator skill over a Kali Docker environment with 50+ tools and MCP backends. Its case-directory artifact contract gives each specialist a fixed output folder: `triage/`, `static/`, `dynamic/`, `yara/`, `report/`.

### Budgeting a swarm

- Cap agents at 4 to 6 active at once. More agents mean more duplicated context.
- Give each worker a hard tool-call budget. `2233admin/reverse-skill-evolver` (github.com/2233admin/reverse-skill-evolver) implements agent swarms with explicit call budgets. Copy that idea.
- One merge pass at the end. Do not let workers talk to each other mid-run. Peer chatter multiplies tokens without adding evidence.

---

## Pattern 6: Adversarial Verification, A Claims and B Refutes

### How it works

This is the strictest form of debate. Agent A produces a finding with evidence. Agent B receives only the claim and the evidence pointers, not A's reasoning. B must try to falsify it.

B's job is specific: find the cheapest refutation. Check the address. Check the string. Check the call edge. Run the function. If B cannot refute within its budget, the claim graduates to the report marked "survived refutation".

### Pipeline

```
Agent A (analyst):   produces claim + evidence pointers
Agent B (refuter):   gets claim + pointers only; tries to disprove
Deterministic gate:  reverify / debugger / objdiff decides VERIFIED / REFUTED / INCONCLUSIVE
Human gate:          claims that survive go to reports/<case>/hallucinations/ first
```

The `hallucinations/` staging directory comes from the zsec.uk production workflow described in the research report. All findings start there and must pass Gates 0-3 (PoC compiles, reproduces, is exploitable, works from low privilege) before promotion to the main report.

### Why B must not see A's reasoning

If B sees A's chain of thought, it anchors on A's assumptions. B then "verifies" the reasoning instead of checking the binary. Give B the claim and the evidence addresses only. Make B re-derive everything.

### Tooling

- reverify (github.com/2akouwu/reverify) for claim-vs-binary checks.
- VerifiedIDA (github.com/SentineLabs/verified-ida) for evidence-anchored annotations that survive compaction.
- re-ground (github.com/shouvikkkk/re-ground) re-derives every address, string, and import claim against the binary.
- Paleblood (github.com/Yharnam-Hunters/Paleblood) and DecompPipeline (github.com/GeneralAtrox/DecompPipeline) for execute-and-compare verification.

---

## How REA, Kong, and Open-ReverseLab Implement These

### REA (Reverse Engineer Anything)

- Repo: github.com/morluto/rea. Install: `npx rea-agents setup`. Observed version: rea-agents 6.8.0 (October 2026). License: MIT.
- Architecture: one MCP server plus CLI. Native analysis delegates to Ghidra, IDA, Hopper, or Kuna. Static JavaScript, .NET, APK, firmware, pcap, WASM, SQLite, and more are built in.
- Multi-agent story: REA is a tool layer, not a swarm. It gives any MCP-speaking agent a routing table and an evidence contract. The `reverse-engineer-anything` skill ships 8 reference files that teach the agent which REA tool answers which question.
- Token controls: REA exposes compact input schemas by default. Set `REA_MCP_INPUT_SCHEMA_PROFILE=full` when you need complete field guidance. Output schemas can be bounded with `REA_MCP_OUTPUT_SCHEMA_PROFILE=compact` or omitted with `off`.
- Evidence contract: every finding carries evidence and provenance. That contract is what makes adversarial verification cheap. Agent B can re-fetch the same evidence pointers.
- Caution: independent evaluations (rea-lab, leanrea) found no significant solve-rate gain over plain agents at about 2x cost. Reported, unverified at scale. Use REA for targeted questions, not open-ended exploration. Star-count claims on the repo are extraordinary and unverified.

### Kong

- Repo: github.com/amruth-sn/kong. PyPI: `kong-re`. License: Apache-2.0.
- Pattern: deterministic five-phase pipeline (see Pattern 2). Not an interactive agent.
- The supervisor coordinates triage, a BFS work queue of parallel per-function analyses, cleanup, one global synthesis call, and Ghidra writeback.
- Cost tracking is built in: `kong/src/llm/usage.py` tracks tokens and provider-aware pricing per run.
- Eval harness: `kong eval analysis.json source.c` scores symbol and type accuracy against ground truth.
- Claimed result: CVE-2024-3094 XZ backdoor reconstruction from stripped liblzma, about 15 minutes, about $6.63. Self-reported.

### Open-ReverseLab

- Repo: github.com/LING71671/open-reverselab. License: GPL-3.0-only.
- Type: agent-native platform plus knowledge base. 100+ MCP tools through `reverse_lab_tools` (curl, frida, ghidra, rizin, yara, triage, kb_router). About 180-194 technique articles across 5 boards (counts differ between README versions).
- Multi-agent story: the context chain `CLAUDE.md -> AGENTS.md -> boards/<board>/AI-USAGE.md` gives every agent the same staged instructions. Per-board `AI-USAGE.md` files scope each specialist to its domain.
- Directory-as-convention: `samples/`, `exports/`, `patches/`, `kb/`, `reports/` give each agent a fixed artifact home. This is the shared-state pattern that makes orchestrator-worker handoffs reliable.
- Environment snapshot: on first run the agent probes the host and caches a sanitized snapshot at `~/.open-reverselab/env/env.md`. Later sessions skip re-probing. This saves tokens on every session.
- Tool health: `python scripts/misc/mcp_smoke_check.py --write-report` verifies real MCP calls, not just config presence.

### Comparison

| Project | Pattern | Agent count | Verification | Best for |
|---|---|---|---|---|
| REA | Tool layer + skill | 1 (orchestrated by your agent) | Evidence contract | Targeted questions across many formats |
| Kong | Planner-executor pipeline | 1 supervisor + N function workers | Writeback + eval harness | Batch symbol/type recovery |
| Open-ReverseLab | Context chain + KB | 1 per session, scoped by board | Smoke checks + report gates | Human-led labs with agents |
| criticic/reagent | Orchestrator-worker | 1 orchestrator + 3 specialists | Dynamic-vs-static hypothesis checks | Interactive binary goals |
| SentinelOne engine | Adversarial consensus | N tool-backed skeptics | Cross-tool agreement | Malware triage at scale |

---

## When Parallelism Helps Versus When It Hurts

### Helps

- Heterogeneous targets: firmware, Electron apps, packed malware. Different regions need different expertise.
- Batch work: thousands of functions. Per-function workers keep each context small.
- Verification: a second agent with different tools catches what the first missed. SentinelOne found half of cited functions in single-agent reports were wrong.
- Long-horizon goals: context compaction degrades recovery of higher-level objects (SentinelLABS finding). Parallel workers with small contexts avoid compaction entirely.

### Hurts

- Small tasks. Spinning up three agents to rename 20 functions costs more than one agent doing it serially.
- Contradictory claims. Two workers can produce conflicting names for the same function. Without a merge rule, the report contains both and the reader cannot tell which is real. Kong solves this with a synthesis phase. Your swarm needs an equivalent.
- Shared context costs. Every worker result flows back through the orchestrator. Total tokens grow roughly linearly with worker count plus orchestrator overhead. DecBench measured $1.0-1.2 per function for gpt-6-astra and $6.6 for claude-opus-4-8. Multiply by worker count.
- Duplicated fetching. Two workers analyzing the same call path pay twice for the same decompilation. Assign disjoint scopes or share a fact warehouse (ripcord pattern: deterministic extraction to Parquet/DuckDB, LLM queries the warehouse).
- Anchored debates. Same-model debaters converge on shared hallucinations. Use different models or deterministic verifiers.

### Rule of thumb

Parallelize across dimensions, not within them. Split by function set, binary region, or file format. Do not split one function's analysis across five agents. That multiplies cost and adds contradiction risk without adding coverage.

---

## Token and Context Budgeting Across Agents

### Budget per role

| Role | Share of budget | Notes |
|---|---|---|
| Planner/orchestrator | 10-15% | Mostly routing and merging. Keep its context small. |
| Workers (map) | 60-70% | The bulk of compute. One function or region per worker. |
| Verifier/refuter | 10-15% | Cheap model is enough if the check is tool-driven. |
| Synthesis/report | 5-10% | One strong-model pass over summaries. |

### Techniques

- Compact schemas at the boundary. REA's default compact input schema and `REA_MCP_OUTPUT_SCHEMA_PROFILE=compact` exist for this reason. Ask every worker for JSON with fixed fields: `address`, `claim`, `evidence`, `confidence`.
- Spill large tool output to files. Workers write full decompilation to `exports/` and return only the path plus a 3-line summary. The orchestrator reads the file only if needed.
- Use a fast cheap model for compaction and routing. reagent's `REAGENT_FAST_MODEL` (default haiku-class) handles context compaction while the main model does analysis.
- Cache decompiler output. If two workers need the same function, fetch once into a shared file. Kong writes results back to Ghidra immediately so downstream callers reuse them.
- Cap worker context. Set a per-worker token ceiling and force summarization at 70% full. SentinelLABS found compaction cut input tokens by about 86 percent but degraded recovery of higher-level objects, so prefer worker boundaries over in-context compaction.
- Track spend per phase. Kong's `llm/usage.py` and reagent's status bar both expose per-run token counts. Log them to `reports/<case>/cost.json`.

### What not to do

- Do not give every worker the full binary metadata. Give each worker only its scope plus a one-paragraph mission.
- Do not let workers re-fetch shared context independently. Build the shared context once (call graph, string table, imports) and pass pointers.
- Do not run the reduce step on raw transcripts. Reduce over structured summaries.

---

## Human-in-the-Loop Checkpoints

Multi-agent systems amplify both throughput and error. The checkpoint design decides which errors reach your report.

### Checkpoint placements

| Point | Gate | Example implementation |
|---|---|---|
| Before dispatch | Human approves the plan and worker scopes | reagent plan mode; Rikugan `/plan` command |
| Before writes | Human approves each database patch | Eleven accept/decline cards; reagent transaction log |
| Before report | Human reviews `hallucinations/` staging | zsec.uk Gates 0-3 |
| Continuous | Human can interrupt, redirect, or kill any worker | reagent TUI status bar; `debug_kill` tool |

### Concrete patterns

- **Command checkpoints, not implicit prompts.** Rikugan exposes `/plan /modify /explore /undo /memory`. The human triggers each phase explicitly. This beats "the agent asks permission sometimes".
- **Staging directories.** Route all agent output through `reports/<case>/hallucinations/` until it passes deterministic gates. Nothing enters the main report unverified.
- **Accept/decline cards for writes.** Eleven shows patching as cards the human approves per change. Keep a per-change authorship log so you can revert one agent's edit without losing the others.
- **Transaction log.** Binary Ninja Sidekick and reagent both keep revertable transaction logs. Every agent edit is a transaction. Rollback is per-transaction, not per-session.
- **Budget checkpoints.** Set a token ceiling per phase. When the ceiling hits, the orchestrator stops and reports partial results. Kong's cost tracking makes this a one-line check.

### Minimum viable HITL

For a first multi-agent setup, implement exactly two gates:

1. Plan approval before any worker dispatches.
2. Report review before any claim leaves `hallucinations/`.

Add write-approval gates only when workers can modify the database or filesystem.

---

## Step-by-Step: Build a Minimal Orchestrator-Worker Loop

1. Define the mission file. Write `mission.md` with the goal, scope, and output contract. Example: "Recover function names for the top 50 call-graph hubs in target.exe. Output `analysis.json` with `address`, `name`, `confidence`, `evidence` per function."

2. Build the shared model. Create `model/` with three files: `observations.jsonl`, `hypotheses.jsonl`, `findings.jsonl`. Workers append. The orchestrator reads.

3. Write worker prompts as files. One `.md` per role: `workers/triage.md`, `workers/static.md`, `workers/dynamic.md`. Each prompt lists allowed tools, output schema, and token ceiling.

4. Add the deterministic verifier. For naming tasks, the verifier re-opens each named function in Ghidra and checks the claimed callees exist. For decomp claims, run reverify. For matching tasks, compile and objdiff.

5. Set budgets. Per-worker token cap. Per-phase dollar cap. Orchestrator merge cap. Log actual spend to `reports/<case>/cost.json`.

6. Run one bounded pilot. Pick 20 functions. Run the full loop. Measure: tokens spent, claims verified, claims refuted, wall time. Compare against a single-agent baseline on the same 20 functions.

7. Scale only if the pilot wins. If the swarm cost more than 1.5x the single agent for equal accuracy, reduce worker count or tighten scopes. REA's independent evaluations suggest many multi-agent setups cost about 2x for no gain.

---

## Pitfalls

- **Unbounded fan-out.** Launching one agent per function on a 10,000-function binary burns budget before the reduce step runs. Batch the map, cap concurrency at 4-6.
- **No merge rule.** Workers that disagree leave contradictions in the report. Always run a synthesis pass that picks one answer per entity and logs the dissent.
- **LLM verifier.** A verifier agent that reads pseudocode and "checks" the claim inherits the executor's hallucinations. Use deterministic tools.
- **Shared mutable state.** Two workers writing to the same Ghidra database corrupt each other's renames. Kong avoids this with immediate writeback in dependency order. For parallel workers, give each a snapshot and merge offline.
- **Context bleed.** Passing the full orchestrator transcript to every worker defeats the purpose. Workers get mission + scope + pointers, nothing else.
- **Ignoring compaction.** When a worker's context compacts, it loses unfinished work (SentinelLABS). Force workers to checkpoint findings to disk before compaction, or keep worker contexts small enough to avoid it.
- **Same-model debates.** Two Claude agents arguing about a packing verdict will often agree on the same wrong answer. Use a different model family or a deterministic check for the refuter.
- **No cost telemetry.** Without per-phase token logs you cannot tell which pattern paid off. Kong and reagent both log usage. Copy them.
- **Star-count trust.** Several 2026 multi-agent RE repos show anomalous star counts. Verify activity, issues, and commit history before adopting.
- **Prompt injection surface.** More agents means more tool calls means more exposure to injected instructions inside binaries and decompiler output. Keep workers read-only on untrusted targets. See `../07-advanced/ai-security-threats.md`.

---

## See Also

- `../03-decomp/verification-loop.md` — deterministic verification gates
- `./context-engineering.md` — compaction, pruning, evidence ledgers
- `../09-ops/cost-tracking.md` — per-phase budgets and cost telemetry
- `../06-topics/malware-analysis.md` — Maljan and multi-engine agreement
- `../07-advanced/ai-security-threats.md` — injection risks in multi-agent pipelines
- `./multi-agent-patterns.md` — single-agent orchestration basics (sibling page)
- `../05-tools/mcp-catalog.md` — MCP server landscape for RE tools
- `../06-topics/malware-analysis.md` — malware triage workflows
