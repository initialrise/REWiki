# RE + AI Cheatsheet

> Tags: cheatsheet, quick-reference, commands, prompts | Difficulty: Any | Prerequisites: none

One-screen reference. Details live on the linked pages.

---

## The Five Rules

1. Verify everything. Deterministic tools decide, not the model.
2. Isolate the agent. Binaries are an injection surface.
3. Chunk the context. Function-at-a-time, map-reduce, or RAG.
4. Separate reader from verifier. The agent that reads hostile content is not the agent that approves claims.
5. Budget before you swarm. Fan out only for bulk work with a shared ledger.

## First 60 Minutes on a New Binary

```bash
file target.bin
sha256sum target.bin
strings -a -n 8 target.bin | head -100
capa target.bin            # capability detection
floss target.bin           # deobfuscated strings
die target.bin             # packer/compiler ID (Detect It Easy)
yarac target.yar target.bin
```

Then: open in Ghidra or IDA, run the MCP bridge, ask the agent for triage only. Do not ask it to "find the bug".

## MCP One-Liners (Claude Code)

```bash
# Ghidra (LaurieWired, headless)
claude mcp add ghidra -- uvx --from git+https://github.com/LaurieWired/GhidraMCP ghidra-mcp --headless --binary /path/to/target.bin

# IDA (Hex-Rays official, IDA 9.4+)
# enable in IDA: Edit > Plugins > MCP (or ida-mcp plugin)

# x64dbg
# install x64dbg-mcp-server plugin, then it serves HTTP on localhost
```

Full catalog: [05-tools/mcp-catalog.md](../05-tools/mcp-catalog.md)

## The Decompile Loop (per function)

1. Get pseudocode (MCP `decompile_function` or headless export).
2. Ask agent: name, signature, purpose, callers/callees, confidence.
3. Verify: does the name match what the code does? Check xrefs and strings.
4. Record: write to function file + evidence ledger.
5. Mark: verified / partial / blocked / hallucinated.

Details: [03-decomp/decompile-workflow.md](../03-decomp/decompile-workflow.md)

## Verification Verdicts

| Verdict | Meaning |
|---|---|
| VERIFIED | Deterministic tool confirmed the claim |
| REFUTED | Tool disproved it |
| INCONCLUSIVE | Tool could not decide; needs manual work |
| GROUNDED / MANGLED / UNGROUNDED | re-ground report audit verdicts |

Tool: `reverify` returns VERIFIED/REFUTED/INCONCLUSIVE per claim.

## Prompt Templates (copy-paste)

Rename a function:

```
Function at 0x<addr>, size <n> bytes, callers: <list>.
Pseudocode:
<paste>
Propose: (1) a semantic name, (2) parameter names/types, (3) return type,
(4) one-sentence purpose, (5) confidence 0-1 and what evidence would raise it.
Do not invent API names. If unsure, say so.
```

Deobfuscate:

```
This function is obfuscated by <packer/obfuscator>. Identify the technique,
give the deobfuscated pseudocode or algorithm, and list which parts are
verified vs inferred.
```

Protocol hypothesis:

```
Here is a hex dump / PCAP summary of <protocol>. Propose a message grammar
(header, fields, endianness). For each field give offset, size, type, and
the bytes that support it. Do not guess semantics without evidence.
```

Full library: [02-collab/prompt-patterns.md](../02-collab/prompt-patterns.md)

## Sandbox Quick Reference

| Need | Tool |
|---|---|
| Full Linux RE VM | [01-setup/linux-sandbox-base.md](../01-setup/linux-sandbox-base.md) |
| Agent isolation | Docker per session; gVisor for stronger boundary |
| Malware detonation | CAPEv2 self-hosted or ANY.RUN cloud |
| Network quarantine | nftables egress deny + DNS sinkhole + INetSim/FakeNet-NG |
| No network at all | `unshare -n` or `--network none` container |

## Model Routing (2026)

| Task | Model tier |
|---|---|
| Bulk rename, triage, summaries | Cheap tier (DeepSeek V4.1 Flash, GLM-5.3 Flash, local Qwen3-Coder) |
| Hard decompile, cross-function reasoning | Frontier (Claude Opus 4.8, GPT-6 Astra) |
| Air-gapped / hostile binaries | Local (Qwen3-Coder-Next 30B-A3B, LLM4Decompile) |
| Avoid | Claude Opus 5.5 for RE (safety classifier halts since ~Oct 21 2026) |

Details: [07-advanced/model-selection.md](../07-advanced/model-selection.md)

## Swarm Rules

- Fan out only for bulk bounded work (rename batches, per-module summaries).
- Keep cross-function reasoning in ONE context.
- Workers write to a ledger, never directly to the Ghidra/IDA DB.
- Cap `maxTurns`. Budget tokens per worker.
- Human approves the plan and the final merge.

Details: [03-decomp/decomp-orchestration.md](../03-decomp/decomp-orchestration.md)

## When AI Fails (know the floor)

- Real obfuscated malware: best agent ~7.6% (MalwareBench).
- Expert-level hardened binaries: near 0% (BIOPSY-Bench).
- Open-ended "find the bug": hallucination-prone, 231% more wasted time.
- Interprocedural reasoning: still weak (ICall-Bench).

The AI proposes. Tools and humans decide.

## See Also

- [index](../index.md) — full index
- [BASE_REPORT.md](https://github.com/initialrise/REWiki/blob/main/BASE_REPORT.md) — the research report
- [00-fundamentals](../00-fundamentals/index.md) — assembly, formats, pseudocode literacy
