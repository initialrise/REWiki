# Choosing Models for RE Tasks

> Tags: models, benchmarks, cost, local-inference | Difficulty: intermediate | Prerequisites: pages 02-06 of this wiki

## Overview

Model choice is now the highest-leverage decision in an AI-assisted RE
workflow. The same binary, the same harness, and a different model can
produce a 30 percent pass rate or an 80 percent pass rate. This page gives
the benchmark evidence, the cost per task, the local-model options, and a
decision table so you pick the right model for each task type.

The short version:

- Frontier agentic models (GPT-6 family, Claude Opus 4.8, Gemini 4) are
  the only models that handle whole-program reverse engineering well.
- Claude Opus 5.5 has a safety-classifier problem for RE work. Do not use
  it for this work. Use Opus 4.8 or a non-Anthropic model.
- Local models work for bounded tasks. Expect weaker results on obfuscated
  or VM-protected binaries.
- Cost differs by an order of magnitude between models. Batch cheap tasks
  on cheap models. Reserve frontier models for hard tasks.

## How It Works

Benchmarks measure models on real RE tasks. No single benchmark is perfect.
Read the numbers with their caveats.

### SRE-Bench

Source: https://arxiv.org/abs/2608.11469 and
https://daplab.cs.columbia.edu/benchmarks/sre-bench

- Task: agents analyze 19 private real-world programs. Each program
  averages 16.9K lines of source. The benchmark uses 44 custom
  anti-analysis mechanisms. It contains 262 binary instances and 1,572
  deterministically graded tasks.
- Result with safeguards on: GPT-5.6-Sol fully solves 31.5 percent of
  instances. Claude Fable 5.1 solves 26.9 percent.
- Result unconstrained: GPT-6-Astra reaches about 82 percent solved when
  cyber safeguards and the budget cap are removed. Reported figure. The
  unconstrained evaluation consumed about $566,000 in tokens.
- Cost per instance: GPT-6-Astra $13.5. GPT-5.6-Sol $42.5.
  Claude Fable 5.1 $34.7. Claude Opus 5 $23.6. DeepSeek-V4.1-Flash $0.50
  but only 0.8 percent solved.

This benchmark is the most rigorous RE measurement available. It shows
that safeguards and budget dominate the score, not raw model capability.

### DecBench

Source: https://decbench.com and https://github.com/noelo-lab/decbench

- Task: ranks decompilers and LLM agents on three metrics. Graph edit
  distance measures control-flow structure. Type correctness compares
  against DWARF ground truth. Recompilation byte-match checks that output
  builds to the same assembly.
- Sample-set agent results: Codex with gpt-6-astra scores 59.6 percent
  union perfect-score. A closed system called Psalms scores 57.6. Claude
  Code with claude-opus-4-8 scores 56.8.
- Traditional decompilers cap lower: Kuna 35.2, Ghidra 26.4, IDA 30.8.
- Cost per function: about $1.0 to $1.2 for gpt-6-astra agent runs. About
  $6.6 for claude-opus-4-8. Reported figures from the DecBench data page.
- Since July 2026 the board runs Codex and Claude Code as competitors
  directly against classical decompilers.

### Retrobench

Source: https://retrobench.ai

- Task: agents receive raw MIPS assembly of N64-era game functions. They
  must write C that recompiles byte-for-byte with the original IDO
  compiler. The budget is 25 builds per function.
- Top scores on v0.4.x: Claude Opus 5.5 about 98.4 mean byte-match.
  GPT-6.1 Sol 94.9. GPT-6 Astra 94.3. Gemini 4 Argon about 84.8.
  Claude Sonnet 5.5 84.2. GLM-5.3 80.2. Kimi K3 79.5.
  DeepSeek-V4.1-Flash about 75.
- Caveats: one architecture (MIPS/IDO), five targets, and run-to-run
  variance in the low double digits on hard targets. Close scores are
  ties, not a strict ordering.

Retrobench is the only public board where the task is genuinely
"reverse engineer assembly, verify against the binary." It is also a good
sanity check for harness quality because the score is a byte comparison,
not an LLM judgment.

### MalwareBench

Source: https://malwarebench.com and https://github.com/arimlabs/malware-bench

- Task: 12 cases of real obfuscated malware across PE, ELF, Mach-O, and
  APK. The agent must produce a behavioral analysis plus a reusable
  extractor tested against held-out variants.
- Result: the best model, GPT-6.1 Sol, scores 7.6 percent best@3. Real
  malware RE is far from solved.
- Refusals: Claude Opus 5.5 at max effort failed to complete about 26
  percent of rollouts due to safeguards. Other models stayed below 10
  percent non-completion. Resampled rollouts were used for scoring.
- Dominant failure: "dependency binding not found" in 47.5 percent of
  runs.
- Cost: mean cost per case varies widely by model. Check the live chart
  on the site.

### BIOPSY-Bench

Source: https://github.com/CLAY-JYB/BIOPSY-Bench

- Task: 25 hardened binaries built from real open-source projects. Five
  scenarios: protection assessment, malware analysis, protocol
  reconstruction, firmware analysis, and patch diffing. All tasks share a
  Claude Code scaffold. Scoring is deterministic. Agents get two hours per
  attempt.
- Result: six models score between 0.01 and 0.035 pass rate per instance.
  Per-instance cost ranges from roughly $2 to $13.
- Meaning: expert-level hardened binaries are near the floor for every
  current model. Plan for human-in-the-loop on these targets.

### Other benchmarks worth knowing

| Benchmark | Source | What it measures |
|---|---|---|
| BinaryAudit | https://github.com/QuesmaOrg/BinaryAudit | Backdoors hidden in ~40MB real binaries. Ghidra and Radare2 available |
| AgentRE-Bench | https://github.com/agentrebench/AgentRE-Bench | 33 challenges, fixed 25-call tool budget. Best score 87.4, no full credit |
| CrackMeBench | https://arxiv.org/abs/2605.10597 | Crackme tasks with deterministic oracles. GPT-5.5 pass@3 92 percent on generated split |
| HWREBench | https://hwrebench.com | Hardware and firmware RE agent evaluation |
| Decompile-Bench | https://arxiv.org/abs/2505.12668 | 2M binary-source pairs for training and eval |
| CREBench | https://arxiv.org/abs/2604.03750 | Crypto-binary RE. Humans still dominate |
| ICall-Bench | https://arxiv.org/abs/2610.37871 | Interprocedural indirect-call reasoning |

## Setup

### Frontier API models

Use a coding-agent harness to reach the frontier models:

- Codex CLI for GPT-6 family models.
- Claude Code for Claude models.
- Gemini CLI or Antigravity for Gemini models.
- Kimi Code or another MCP-capable harness for Kimi K3.

See ../03-harnesses/harness-landscape.md for harness setup and
../04-mcp/mcp-servers.md for connecting MCP servers.

### Local models

For local inference, the proven stack is:

- Ollama for the simplest runtime. https://ollama.com
- llama.cpp for lower-level control. https://github.com/ggml-org/llama.cpp
- vLLM for production serving. https://github.com/vllm-project/vllm

Recommended local models for RE:

| Model | Size | Source | Notes |
|---|---|---|---|
| Qwen3-Coder-Next | 30B-A3B MoE, 262K context | https://huggingface.co/Qwen/Qwen3-Coder-Next | Best open option for local RE. GGUF and FP8 variants exist |
| LLM4Decompile v2 family | 1.3B to 33B | https://github.com/albertan017/LLM4Decompile | Specialist assembly-to-C and Ghidra-pseudo-code refinement |
| CodeInverter | 1.3B / 6.7B | https://github.com/LiuPeiP-CS/CodeInverter | CFG and data-mapping augmented decompilation |

Hardware rules of thumb:

- 7-9B Q4 models need 8-16GB VRAM or RAM. Weak on obfuscated code.
- 27-32B Q4 models need about 20-24GB VRAM.
- 70B+ models need 48GB+ or heavy CPU offload. Offload is slow.
- Ghidra itself wants 4-16GB heap. Set `GHIDRA_HEADLESS_MAXMEM`.

## Usage

### Step 1: classify the task

Before you pick a model, classify the task:

| Task type | Examples |
|---|---|
| Triage and naming | Function naming, string recovery, quick decompile of one function |
| Bounded decompilation | One function or one small module to pseudo-C |
| Whole-program RE | Full binary analysis, cross-function reasoning, protocol recovery |
| Obfuscated / VM-protected | VMProtect, Themida, OLLVM, custom packers |
| Malware analysis | Real obfuscated samples, C2 extraction, unpacking |
| Firmware / hardware | U-Boot, bare-metal, FPGA bitstreams |
| Batch work | Rename hundreds of functions, type recovery at scale |

### Step 2: pick the model tier

Use the decision table below. When in doubt, start one tier higher and
drop down only if cost becomes a problem.

| Task type | First choice | Fallback | Avoid |
|---|---|---|---|
| Whole-program RE, hard binary | GPT-6 Astra or GPT-6.1 Sol via Codex CLI | Claude Opus 4.8 via Claude Code | Claude Opus 5.5 |
| Decompilation with byte-match goal | GPT-6.1 Sol or GPT-6 Astra | Gemini 4 Argon | Small local models for hard targets |
| Interprocedural / cross-function | GPT-6 Astra, Kimi K3 (1M context) | DeepSeek V4 Pro | Models with small context windows |
| Sensitive or private binary | Kimi K3, DeepSeek V4, GLM-5.3 via MCP harness | Local Qwen3-Coder-Next | Sending the binary to a hosted API you do not control |
| Obfuscated / VM-protected | Frontier model plus specialized deobfuscation tooling | Kimi K3 with full Ghidra export | Any small local model alone |
| Real malware | GPT-6.1 Sol or Gemini 4 Argon | Opus 4.8 | Opus 5.5, small local models |
| Batch renaming / comments | Local Qwen3-Coder-Next or LLM4Decompile v2 | Cheap API model | Frontier model for every function |
| Firmware / hardware | Gemini 4 Argon, Kimi K3 | DeepSeek V4.1 Flash | Opus 5.5 |
| Crackmes / CTF | Any frontier model | Local model if target is small | Relying on public CTF scores; they are contaminated |

### Step 3: verify before you trust

Model output is a hypothesis. Always verify:

- For decompilation, recompile and diff. Use objdiff or a byte-compare
  loop. See ../03-decomp/verification-loop.md.
- For renames and types, spot-check against disassembly. See
  ../03-decomp/verification-loop.md.
- For claims about a binary, run deterministic tools. See
  ../05-verification/reverify.md if it exists, or the reverify repo at
  https://github.com/2akouwu/reverify.

### Step 4: watch cost

Cost per task varies by an order of magnitude:

| Benchmark | Model | Cost per unit |
|---|---|---|
| DecBench | gpt-6-astra | $1.0-1.2 per function |
| DecBench | claude-opus-4-8 | $6.6 per function |
| SRE-Bench | GPT-6-Astra | $13.5 per instance |
| SRE-Bench | GPT-5.6-Sol | $42.5 per instance |
| BIOPSY-Bench | six models | $2-13 per instance |

Rules:

- Batch cheap tasks on cheap models.
- Reserve frontier models for tasks where the cheap model fails.
- Set a hard budget per task. SRE-Bench shows budget dominates score.
- Log token usage per task. The DecBench data page shows recorded token
  usage and list-price estimates.

## Pitfalls

- Do not use Claude Opus 5.5 for RE work. Since about October 21, 2026,
  its safety classifier reportedly halts RE and decompilation requests
  mid-answer. Anthropic routes cyber tasks to Opus 4.8. Use Opus 4.8 or a
  non-Anthropic model. See
  https://malwarebench.com for the measured 26 percent non-completion rate.
- Do not trust benchmark scores without reading the caveats. Retrobench
  is one architecture and five targets. MalwareBench is 12 cases.
  BIOPSY-Bench is 25 binaries. Small-N results move.
- Do not assume a high score on public CTFs or crackmes transfers to real
  work. Public corpora are contaminated by memorization. CrackMeBench
  shows public calibration scores far below generated-split scores.
- Do not feed raw assembly to a general model when a decompiler exists.
  Feed Ghidra or IDA pseudocode. See ../03-decomp/decompilers.md.
- Do not run local models on obfuscated binaries and expect parity with
  frontier models. Local models are for bounded tasks and private data.
- Do not skip verification. LLM agents hallucinate function references and
  vulnerability claims. SentinelOne found half of cited functions in
  agent RE reports were wrong. Reverify with deterministic tools.
- Do not expose MCP servers without authentication on non-loopback
  interfaces. See ../04-mcp/mcp-security.md if it exists.
- Do not install skills or MCP servers from unverified sources.

## See Also

- ../03-decomp/verification-loop.md
- ../03-decomp/decompilers.md
- ../04-mcp/mcp-servers.md
- ../04-mcp/mcp-security.md
- ../05-verification/reverify.md
- ../07-ai/local-models.md
- ../02-harnesses/harness-landscape.md
