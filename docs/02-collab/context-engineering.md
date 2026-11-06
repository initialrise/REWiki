# Context Engineering for Binary Analysis

> Tags: context-engineering, llm, decompilation, mcp, rags | Difficulty: Intermediate | Prerequisites: basic MCP setup and one working decompiler bridge (see `../05-tools/mcp-catalog.md`)

## Overview

Context engineering is the discipline of deciding what the model sees, in what form, and when.

For binary analysis, this discipline decides whether a session succeeds or fails.

The bottleneck is real. A 5 MB stripped binary decompiles to hundreds of megabytes of pseudocode. Even a 1M-token context window holds only a fraction of a single large function set. The model cannot read the whole binary. The agent must choose what to expose.

The evidence is clear. A 2026 study of agent trajectories ("Humans versus Machines," arXiv:2610.14960) found agents exhibit "greedy fetching" on real binaries. Agents pull broad decompilation dumps and saturate the context window. They rarely revisit earlier evidence after compaction. The result is worse answers at higher cost.

SentinelLABS found that context compaction cut input tokens by about 86 percent but degraded recovery of higher-level objects (reported in the field report "Sol Searching," sentinelone.com). Models lose track of unfinished work when context shrinks.

The winning pattern is not bigger context. It is better selection. Feed pseudocode, not assembly. Feed one function at a time. Store the rest outside the window and retrieve it on demand.

## How It Works

### The scale problem

Estimate before you feed. Rough figures:

| Artifact | Typical size | Fits in a 1M-token window? |
|---|---|---|
| One small function (pseudocode) | 200-2,000 tokens | Yes, easily |
| One large function | 10,000-100,000 tokens | Sometimes, with truncation |
| One medium binary, full decompile | 500K-5M+ tokens | No |
| One large binary, full decompile | 10M+ tokens | Never |
| Strings and imports dump | 1K-100K tokens | Usually yes |
| Call graph as text | 10K-500K tokens | Partially |

A rule of thumb: decompiled C runs roughly 1 token per 3-4 characters. A 40 MB binary can produce over a million lines of pseudocode. No current model holds that.

### The selection hierarchy

Work down this list until the model has what it needs:

1. **Metadata first.** Strings, imports, exports, section headers, entropy. Small. High signal.
2. **Call graph slices.** The functions on the path from `main` to the target. Not the whole graph.
3. **One function at a time.** Full pseudocode of a single function, plus its immediate callees as one-line summaries.
4. **Chunked large functions.** Split on basic-block boundaries. Feed the entry block first, then demand more blocks on request.
5. **Full decompile.** Only for small binaries or when nothing else works.

### Decompilation chunking strategies

Pick one strategy per task. Do not mix them mid-session without a reason.

#### Strategy 1: Function-at-a-time

The default. One function per prompt or per tool call.

How it works:

1. Extract the function list from Ghidra, IDA, or Binary Ninja.
2. Decompile one function to a file.
3. Give the model the file path, not the content. Or paste the content if it is under your token budget.
4. Ask a bounded question: "What does this function compute?" or "What crypto does this loop implement?"
5. Record the answer with the function address in your notes file.

This is the GptHidra pattern. Reported cost for GPT-WPRE was $16.60 for a 466-function library at 2023 pricing. Modern models cost less per token but the pattern is the same.

When to use it: naming, type recovery, understanding a single routine, answering "what does this do."

#### Strategy 2: Call-graph slices

For interprocedural questions. "Why does this call chain decrypt the payload?"

How it works:

1. Identify the entry point and the target.
2. Compute the shortest call path between them.
3. For each function on the path, write one summary line: name, address, signature, one-sentence purpose.
4. Feed the path skeleton first. Ask the model which function to inspect next.
5. Expand one function at a time.

This is the Kong pattern (github.com/amruth-sn/kong): call-graph-ordered analysis. Kong reconstructed the CVE-2024-3094 XZ backdoor kill chain from stripped `liblzma` in about 15 minutes for about $6.63 (published result, vendor-reported).

When to use it: tracing data flow across functions, finding the caller of an interesting API, understanding control flow between modules.

#### Strategy 3: Map-reduce over functions

For bulk work. Rename 5,000 functions. Summarize every function in a module.

How it works:

1. **Map phase.** Process functions in batches. Each batch is independent. For each function, produce a structured record: address, decompiled pseudocode hash, inferred name, inferred purpose, confidence.
2. **Reduce phase.** Feed the batch records (not the pseudocode) to a second pass. Ask for module-level synthesis: what does this module do, what are the subsystems.
3. **Write back.** Apply the names to the database in a batch. Verify each write.

When to use it: bulk renaming, module summarization, triage of a large binary.

The map phase is embarrassingly parallel. Run it through a script that calls the model API directly, not through an agent harness. The reduce phase is the only part that needs an agent.

#### Strategy 4: Chunked large functions

Some functions decompile to more tokens than the window holds. VM handlers, giant switch statements, and generated code produce 50K+ token functions.

How it works:

1. Split the function at basic-block boundaries in Ghidra or IDA.
2. Feed the entry block plus a block index. The model sees block labels, not all bodies.
3. Let the model request blocks by label. "Show me block 0x4012a0 and its successors."
4. Reconstruct the function piece by piece.

This is the pattern the `wul7chaos/vmp-reverse-skill` (github.com/wul7chaos/vmp-reverse-skill) uses for VMProtect handlers: slice the handler, feed slices, verify claims with Z3.

### Progressive disclosure via skills

The Agent Skills format (github.com/agentskills/agentskills) implements progressive disclosure natively. Use it.

The mechanics:

| Layer | When it loads | Size budget |
|---|---|---|
| Skill name and description | Always, at session start | About 100 tokens per skill |
| `SKILL.md` body | When the skill activates | Under 500 lines or 5,000 tokens |
| `references/*.md` files | On demand, when the agent reads them | Unbounded |
| `scripts/` and `assets/` | On execution | Unbounded |

For RE work, this means:

- Keep the routing table in the SKILL.md body. "APK goes to jadx. PE goes to IDA. Firmware goes to binwalk then Ghidra."
- Put long procedures in `references/`. Example: a 40-line Ghidra PyGhidra script belongs in `references/pyghidra-batch.md`, not in the SKILL.md.
- Put evidence contracts in the body. "Every finding must cite a file offset or address."

The ReVa skills (github.com/cyberkaida/reverse-engineering-assistant) are the reference implementation. Each SKILL.md encodes tool-choice heuristics and explicit "do not use when" boundaries.

### Evidence files and structured notes

Do not let the agent hold findings only in context. Context compacts. Context gets summarized. Context loses detail.

Write findings to files as you go. The evidence file is the durable record.

A minimal evidence file format:

```markdown
# Analysis: target.exe

## Session: 2026-11-05

### Function 0x401000 — sub_401000
- Decompile: out/func_401000.c
- Purpose: XOR-decrypts a 256-byte buffer with key from .data
- Confidence: high (verified by manual read)
- Callers: 0x402000, 0x403100
- Notes: key schedule looks like RC4 init

### Claim: payload is RC4-encrypted
- Evidence: out/func_401000.c lines 12-45
- Verification: reverify VERIFIED (byte comparison)
- Status: confirmed
```

Rules for the format:

1. One entry per function or per claim.
2. Every entry cites a file path or an address.
3. Every claim has a verification status: `confirmed`, `unverified`, `refuted`.
4. The file is append-only during a session. Never rewrite history.
5. The agent reads the file at session start. It writes to it after each finding.

Tools that implement this pattern:

| Tool | URL | What it does |
|---|---|---|
| VerifiedIDA | github.com/SentineLabs/verified-ida | Evidence-anchored IDA annotations. Ledger survives compaction |
| REA | github.com/morluto/rea | Evidence and provenance contract on every finding |
| reverify | github.com/2akouwu/reverify | Deterministic check of LLM claims against the binary |
| re-ground | github.com/shouvikkkk/re-ground | Re-derives every address and string claim |

### When to use 1M-context models versus RAG

Two strategies compete for "the binary is too big" problem. They solve different problems.

#### 1M-context models

Models with 1M-token windows: Kimi K3, DeepSeek V4 Pro, GLM-5.3 (all open-weight, per 2026 sources). Claude and GPT frontier models also advertise large windows.

Use a 1M-context model when:

- The decompiled output fits in about 700K tokens. You have headroom for the prompt and the answer.
- The task needs global reasoning. "Find all callers of this function across the whole binary."
- You want to avoid retrieval errors. RAG misses relevant functions. A full dump does not.
- The binary is medium-sized. A few hundred functions.

Do not use a 1M-context model when:

- The binary decompiles to more than the window. You will truncate and lose evidence.
- The task is repetitive. Bulk renaming 5,000 functions through a 1M window is expensive and slow.
- You need reproducibility. A retrieval pipeline is deterministic. A 1M prompt is not.

Cost note: 1M-token prompts cost real money. A single 500K-token prompt at frontier pricing costs dollars. Run the math before you commit.

#### RAG over decompiled code

Retrieval-augmented generation: embed each function, store vectors, retrieve the top-k relevant functions for each query.

Use RAG when:

- The binary is large. More than a few thousand functions.
- The task is exploratory. "Find functions that touch the network."
- You run many queries against the same binary. The index cost amortizes.
- You need citations. RAG returns function addresses. You can verify them.

Do not use RAG when:

- The task needs the whole picture. "Understand the protocol between these two modules." Retrieval misses context.
- Embedding quality is poor for the content type. Pseudocode with heavy symbol names embeds worse than prose.
- The binary changes during analysis. You renamed functions. The index is stale.

### Vector DB over pseudocode

Two stores dominate the 2026 tooling:

| Store | URL | Strength | Weakness |
|---|---|---|---|
| ChromaDB | github.com/trychroma/chroma | Python-native. Easy prototyping. `chromadb.Client()` in-memory | Heavier than SQLite. Server mode for production |
| sqlite-vec | github.com/asg017/sqlite-vec | Single file. No server. Runs anywhere SQLite runs | Pre-v1. Expect breaking changes |

For RE work, sqlite-vec is usually the better fit. One file per binary. No daemon. Easy to copy, version, and delete. The `vec0` virtual table stores vectors plus metadata columns. You can filter by function address, module, or name.

ChromaDB is better when you already have a Python pipeline and want the richer query API.

Existing integrations:

| Tool | URL | What it does |
|---|---|---|
| clearbluejar/pyghidra-mcp | github.com/clearbluejar/pyghidra-mcp | Headless PyGhidra MCP with ChromaDB semantic search over decompiled code |
| llnl/OGhidra | github.com/llnl/OGhidra | Ghidra plus Ollama bridge. RAG over functions |
| radareorg/r2ai | github.com/radareorg/r2ai | r2 plugin with RAG vector DB |

### Dump-to-file patterns

The single most effective context-engineering technique for RE: never let large tool output enter the conversation. Write it to a file. Give the model the path.

Bad pattern:

```
MCP call: decompile_function(0x401000)
Result: 45,000 tokens of pseudocode injected into context
```

Good pattern:

```
MCP call: decompile_function_to_file(0x401000, "out/func_401000.c")
Result: "Wrote 1,247 lines to out/func_401000.c"
Agent: reads the file in chunks, or greps it, or summarizes it
```

The agent can use `Read`, `Grep`, `head`, `tail`, and `sed` on the file. It sees only what it needs.

Tools that support this pattern:

| Tool | URL | How it works |
|---|---|---|
| Hex-Rays ida-mcp | github.com/HexRaysSA/ida-mcp | "Code mode." Agent writes IDAPython that writes files. Only a few MCP tools exposed |
| P4nda0s/IDA-NO-MCP | github.com/P4nda0s/IDA-NO-MCP | Exports IDA decompilation to plain files for AI IDEs. Anti-MCP approach |
| akiselev/ghidra-cli | github.com/akiselev/ghidra-cli | Headless Ghidra automation with JSON output. Spill large results to files |
| hermes-rea-cli | github.com/lesterppo/hermes-rea-cli | Token-lean CLI output. Spill-to-file for large results |
| akiselev/ghidra-cli skills | github.com/akiselev/ghidra-cli | Ships a SKILL.md that teaches the agent the CLI |

The Hex-Rays approach is the most radical. Instead of 100+ MCP tools, the official server exposes `open_database`, `execute_python`, and documentation search. The agent writes IDAPython scripts that do the work and write results to files. Hex-Rays claims about 20 percent fewer tokens than community servers on an internal benchmark (vendor claim, unverified independently).

### The fact-warehouse pattern

For very large binaries, go further. Extract facts deterministically. Store them in a queryable warehouse. Let the agent query the warehouse, not the binary.

The ripcord pattern (github.com/DavidClawson/ripcord):

1. PyGhidra script decompiles every function to Parquet.
2. Load into DuckDB.
3. Agent queries DuckDB with SQL. "Show me all functions that call `CreateFileW`."
4. Agent reads only the relevant pseudocode files.

This is the most scalable pattern found in 2026 tooling. The warehouse is deterministic. The agent's context stays small. The evidence is reproducible.

## Setup

### Minimum viable context pipeline

You need four pieces:

1. A decompiler bridge that writes to files. Official Hex-Rays ida-mcp, bethington/ghidra-mcp, or akiselev/ghidra-cli.
2. A directory structure for outputs. Example: `out/functions/`, `out/strings.txt`, `out/callgraph.json`, `out/notes.md`.
3. A notes file the agent reads and writes. See the evidence file format above.
4. A skill that teaches the agent the workflow. See `../05-tools/skills-catalog.md`.

### Directory layout

```
analysis/
  target.exe
  out/
    functions/          # one .c file per function
    strings.txt
    imports.txt
    exports.txt
    callgraph.json
    notes.md            # evidence file
    index.json          # function index: address -> file path
  skills/
    my-target/
      SKILL.md
      references/
        ghidra-batch.md
```

The `index.json` is the map. It tells the agent which file holds which function without loading the files.

### Embedding pipeline for RAG

If you choose RAG over 1M-context:

```python
# Pseudocode. Run after decompilation.
import sqlite_vec
import sqlite3

conn = sqlite3.connect("analysis/out/vec.db")
conn.enable_load_extension(True)
sqlite_vec.load(conn)

conn.execute("""
CREATE VIRTUAL TABLE functions USING vec0(
  embedding float[1536],
  function_address TEXT,
  function_name TEXT,
  file_path TEXT
)
""")

# For each decompiled function:
#   text = open(file_path).read()
#   embedding = embed(text)  # your embedding model
#   conn.execute("INSERT INTO functions(rowid, embedding, function_address, function_name, file_path) VALUES (?, ?, ?, ?, ?)",
#                (addr, embedding, name, path))
```

Query pattern:

```sql
SELECT function_address, function_name, file_path, distance
FROM functions
WHERE embedding MATCH :query_embedding
ORDER BY distance
LIMIT 10;
```

Then read the top-k files. Do not paste them all into context.

## Step-by-Step

### Procedure: analyze a medium binary (1,000-10,000 functions)

1. **Extract metadata.** Run a script that dumps strings, imports, exports, and section headers to `out/`. This is usually under 50K tokens.
2. **Build the function index.** Decompile every function to `out/functions/func_<addr>.c`. Write `out/index.json` mapping addresses to paths.
3. **Write the notes file.** Create `out/notes.md` with the session header and empty sections.
4. **Start the agent.** Point it at `out/index.json` and `out/notes.md`. Tell it: "Read the index. Do not read function files yet."
5. **Triage.** Ask the agent to identify the 20 most interesting functions from metadata alone. It picks addresses. You approve.
6. **Expand.** For each approved function, ask the agent to read the file and write a summary to `notes.md`.
7. **Follow the call graph.** When a summary mentions a callee, add it to the queue.
8. **Verify.** Every claim in `notes.md` gets a verification status. Use reverify or manual read.
9. **Compact periodically.** Every 50 findings, ask the agent to write a session summary to `notes.md`. Start a fresh session if the context is degrading.

### Procedure: analyze a large binary (10,000+ functions)

Same as above, but add the fact-warehouse step:

1. Decompile all functions to files.
2. Load into DuckDB or sqlite-vec.
3. Agent queries the warehouse instead of reading files directly.
4. Agent reads only the top-k relevant files per query.

### Procedure: bulk rename

1. Build the function index.
2. Run the map phase: for each function, produce `{address, suggested_name, confidence, reason}`.
3. Write results to `out/renames.json`.
4. Human reviews the JSON. Approves or rejects each entry.
5. Apply approved renames to the database in a batch.
6. Verify by re-decompiling a sample and checking the names appear.

## Pitfalls

- **Greedy fetching.** The agent pulls every decompiled function "to be safe." Context saturates. Cost explodes. Mitigate with the index-and-read-on-demand pattern.
- **Compaction loss.** Context compacts mid-session. The agent forgets earlier findings. Mitigate with the evidence file. The file survives compaction. The agent re-reads it.
- **Truncated functions.** A function larger than the window gets cut. The model sees half the logic and hallucinates the rest. Mitigate with chunked-function strategy or block-level slicing.
- **Stale index.** You renamed functions. The vector DB still has old names. Re-embed after bulk renames.
- **Embedding mismatch.** Pseudocode embeds poorly if symbol names dominate. Strip auto-generated names before embedding, or embed the function signature plus first 20 lines only.
- **1M-context cost.** A 500K-token prompt costs real money. A batch of 100 such prompts costs hundreds of dollars. Use RAG for repetitive work.
- **RAG misses.** Retrieval returns top-k by similarity. The relevant function may rank 50th. Mitigate with hybrid search (vector plus keyword) or by increasing k and reading more files.
- **Agent writes to DB during untrusted sessions.** Prompt injection through decompiled output can make the agent rename or comment maliciously. Use read-only MCP mode. See `../07-advanced/ai-security-threats.md`.
- **No verification loop.** The agent produces confident-sounding nonsense. Every claim needs a deterministic check. See `../03-decomp/verification-loop.md`.

## See Also

- `../05-tools/mcp-catalog.md` — MCP server setup for IDA, Ghidra, Binary Ninja
- `../05-tools/skills-catalog.md` — writing skills for RE workflows
- `../09-ops/notes-and-evidence.md` — structured notes and claim tracking
- `../03-decomp/verification-loop.md` — deterministic verification of LLM claims
- `../03-decomp/batch-decompilation.md` — map-reduce patterns for large binaries
- `../07-advanced/ai-security-threats.md` — injection risks from binary content
- `../06-topics/malware-analysis.md` — context strategy for malware analysis
