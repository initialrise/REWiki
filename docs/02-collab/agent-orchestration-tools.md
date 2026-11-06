# Agent Orchestration Tools and Frameworks

> Tags: agents, orchestration, mcp, claude-code, codex, cursor, langgraph | Difficulty: Intermediate | Prerequisites: `../05-tools/mcp-catalog.md`, `../05-tools/skills-catalog.md`

## Overview

An orchestration tool decides three things. It decides which agent does which work. It decides how much context each agent sees. It decides how results return to the main thread.

Two families of tools exist.

- **Coding-agent harnesses** run inside your terminal or editor. Examples: Claude Code, Codex CLI, Cursor, Gemini CLI. They spawn subagents on demand. They merge results as short reports.
- **Agent frameworks** are libraries you program against. Examples: LangGraph, CrewAI, Microsoft Agent Framework, OpenAI Agents SDK. They give you explicit graphs, state, and checkpoints.

For reverse engineering, harnesses win for interactive sessions. Frameworks win for repeatable batch pipelines. Many production RE systems mix both. A LangGraph pipeline calls deterministic extractors first. A coding agent then reasons over the facts.

## How It Works

### Context isolation

Every orchestration tool isolates subagent context. The subagent gets a fresh window. It sees only the prompt the parent writes. It returns only a final summary.

This matters for RE. A Ghidra decompile of one function can produce thousands of lines of pseudocode. If that output lands in the main conversation, context fills fast. Subagents keep the noise out.

### Result merging

All harnesses merge results the same way. The parent writes a delegation prompt. The subagent works. The subagent returns a final message. The parent reads only that message.

Frameworks differ. LangGraph merges through shared state and checkpoint writes. CrewAI merges through a Flow that collects Crew output. Microsoft Agent Framework merges through workflow steps and sessions.

### Write isolation

Most harnesses share the working directory by default. Parallel write-heavy subagents can overwrite each other. Cursor and Claude Code offer worktree isolation. Codex subagents inherit the parent sandbox. Gemini CLI isolates tools but shares the filesystem.

## Coding-Agent Harnesses

### Claude Code subagents

Docs: https://code.claude.com/docs/en/sub-agents

Subagents are Markdown files with YAML frontmatter. Store them in `.claude/agents/` for the project or `~/.claude/agents/` for all projects.

```markdown
---
name: ghidra-triager
description: Use for bounded triage of a Ghidra export. Returns function lists and string hits.
tools: Read, Grep, Glob, mcp__ghidra__decompile_function
model: sonnet
maxTurns: 25
background: true
---

You analyze Ghidra MCP output only. You return findings with addresses.
You never claim a function is safe without evidence.
```

Key frontmatter fields:

| Field | Effect |
|---|---|
| `tools` | Tool allowlist. `mcp__server__tool` names MCP tools. |
| `disallowedTools` | Tool denylist. Beats `tools`. |
| `model` | `sonnet`, `opus`, `haiku`, `fable`, or a full model ID. |
| `permissionMode` | `default`, `plan`, `acceptEdits`, `dontAsk`, `bypassPermissions`. |
| `maxTurns` | Turn cap. On hit, output returns marked partial. Resume continues it. |
| `background` | `true` keeps the subagent running in the background. |
| `isolation: worktree` | Runs in a temporary git worktree with its own branch. |
| `mcpServers` | Per-subagent MCP servers. |
| `memory` | `user`, `project`, or `local`. Persists across sessions. |

Built-in subagents: `Explore` (read-only search), `Plan` (plan-mode research), and `general-purpose`.

Behavior notes:

- Subagents get their own system prompt. They do not inherit CLAUDE.md unless configured.
- A non-fork subagent starts fresh. It does not see the parent conversation.
- Fork mode is on by default in interactive sessions. Subagents then inherit the full tool pool.
- Background subagents get a reduced built-in tool set. They keep all MCP tools.
- Nested subagents run to three layers deep.
- Subagent requests count toward the same usage limits as the main conversation.

Agent teams: an experimental feature. Named subagents become addressable teammates. The parent can message them after they finish. This suits long-running parallel RE work.

### Codex CLI subagents

Docs: https://developers.openai.com/codex/subagents

Subagents are on by default in current Codex releases. The parent spawns them after a direct request or a project instruction.

Built-in agents: `default`, `worker`, `explorer`.

Custom agents are TOML files. Put them in `~/.codex/agents/` for personal agents or `.codex/agents/` for project agents.

```toml
name = "binary-triager"
description = "Read-only triage of binaries through MCP tools. Returns IOC candidates and function maps."
developer_instructions = """
Stay read-only. Use decompile and disassembly tools only.
Report every claim with a file offset or address.
Do not rename symbols. Do not write to the database.
"""
model = "gpt-6-luna"
model_reasoning_effort = "high"

[features]
shell_tool = false
```

Notes:

- Custom agents inherit the parent sandbox, provider, and MCP servers. A custom file cannot override them.
- `agents.enabled`, `agents.max_concurrent_threads_per_session`, `agents.default_subagent_model`, and `agents.default_subagent_reasoning_effort` live under `[agents]` in `config.toml`.
- Subagent threads appear as separate threads. You can open and steer them.
- Codex waits for all requested subagents. It then returns one consolidated response.
- Docs warn that subagent workflows consume more tokens than a single-agent run.

### Cursor agents

Docs: https://cursor.com/docs/agent/subagents

Subagents are Markdown files with YAML frontmatter. Locations:

| Scope | Path |
|---|---|
| Project | `.cursor/agents/` |
| User | `~/.cursor/agents/` |
| Claude-compatible | `.claude/agents/`, `~/.claude/agents/` |
| Codex-compatible | `.codex/agents/`, `~/.codex/agents/` |

Frontmatter fields: `name`, `description`, `model`, `readonly`, `is_background`.

```markdown
---
name: verify-decompile
description: Independently checks a decompiled function against disassembly. Use after every rename or type change.
readonly: true
model: inherit
is_background: true
---

Compare the pseudocode to the disassembly listing.
Flag every mismatch. Return a verdict per claim: confirmed, wrong, or unverified.
```

Behavior notes:

- Built-in subagents: `explore` (codebase search) and `browser` (browser automation through MCP).
- Foreground subagents block. Background subagents return immediately and write output under `~/.cursor/subagents/`.
- `model: inherit` uses the parent model. A specific model ID overrides it.
- Cloud subagents run on their own VM and branch. Local subagents share the checkout unless you ask for isolation.
- Parallel Task calls launch subagents simultaneously.
- Nested subagents work to two levels since Cursor 2.5.
- Cursor docs warn: parallel write-heavy subagents create conflicts. Prefer read-heavy delegation.

### Gemini CLI subagents

Docs: https://github.com/google-gemini/gemini-cli/blob/main/docs/core/subagents.md

Subagents are Markdown files with YAML frontmatter. Locations: `.gemini/agents/` for the project, `~/.gemini/agents/` for the user.

```markdown
---
name: ghidra-reader
description: Reads Ghidra MCP output and returns structured function notes.
kind: local
tools: [mcp_ghidra_*]
model: gemini-3-flash-preview
max_turns: 20
timeout_mins: 10
---
```

Fields: `name`, `description`, `kind`, `tools`, `mcpServers`, `model`, `temperature`, `max_turns`, `timeout_mins`.

Behavior notes:

- Invoke with `@name` at the start of a prompt, or let the main agent delegate automatically.
- Built-ins: `codebase_investigator`, `cli_help`, `generalist`, `browser_agent` (disabled by default).
- Tool wildcards: `*` for all tools, `mcp_*` for all MCP tools, `mcp_server_*` for one server.
- Subagents cannot spawn other subagents. Recursion protection is hard-coded.
- Inline `mcpServers` in frontmatter gives a subagent its own MCP connections.
- `agents.overrides` in `settings.json` enables, disables, or reconfigures agents.
- A Policy Engine TOML file can deny or allow a subagent by name.
- Remote subagents delegate over the Agent2Agent protocol. Unverified for RE use.

### AgentSwarm

The term "AgentSwarm" is not a single product. It names a pattern: many agents, one coordinator, explicit call budgets. The RE project `2233admin/reverse-skill-evolver` uses agent swarms with explicit call budgets. See `../05-tools/skills-catalog.md`.

Claude Code agent teams and Codex parallel subagents implement the same pattern inside a harness. Frameworks like LangGraph implement it as a graph.

## Agent Frameworks

### OpenAI Agents SDK

Docs: https://openai.github.io/openai-agents-python/

Python package `openai-agents`. It replaced the earlier Swarm experiment.

Primitives:

- `Agent`: instructions plus tools.
- `Runner`: the loop that runs the agent until the task completes.
- Tools: function tools, hosted tools, and MCP server tools.
- Handoffs: one agent delegates to another agent.
- Agents as tools: a manager agent calls a specialist as a function.
- Guardrails: validators that run in parallel and fail fast.
- Sessions: persistent memory across turns.
- Sandbox agents: specialists inside isolated workspaces with resumable sessions.

```python
from agents import Agent, Runner

triage = Agent(name="triager", instructions="Classify the sample. Return IOC candidates only.")
namer = Agent(name="namer", instructions="Propose function names with evidence.")

orchestrator = Agent(
    name="re-orchestrator",
    instructions="Route each subtask to the right specialist.",
    tools=[triage.as_tool(), namer.as_tool()],
)

result = Runner.run_sync(orchestrator, "Triage sample.bin and rename its entry function.")
```

RE fit: good for Python pipelines that already call MCP servers. Weak for interactive binary work. Tracing helps debug long runs. The SDK targets OpenAI models first. Other providers work through model adapters.

### LangGraph

Docs: https://docs.langchain.com/oss/python/langgraph/persistence

LangGraph models an agent run as a state graph. Nodes are functions or agents. Edges define transitions. State persists between steps.

Two persistence systems:

| System | Scope | Use for |
|---|---|---|
| Checkpointer | One thread | Conversation continuity, human-in-the-loop, time travel, fault recovery |
| Store | Across threads | User preferences, facts, shared knowledge |

Checkpointers: `MemorySaver` for development, `PostgresSaver` for production. Keep `thread_id` under 255 characters.

RE fit: strong for batch pipelines. Examples in the wild: `louisgthier/decompai` (LangGraph agent over ELF tools in a Kali container), `chadcox/malware_re_agent` (LangGraph triage to STIX output). See `03-decomp/verification-loop.md` for the verify step pattern.

Cost note: LangGraph is MIT-licensed and free. Cost is model tokens plus your infrastructure.

### CrewAI

Docs: https://docs.crewai.com/introduction

CrewAI splits work into two layers:

- **Flows**: event-driven workflows. They manage state, control flow, and conditionals.
- **Crews**: teams of role-playing agents. A Flow delegates a task to a Crew. The Crew returns a result.

Install agent skills for coding agents: `npx skills add crewaiinc/skills`.

RE fit: usable but heavyweight. Crews suit role-separated work like triage versus reporting. Flows suit deterministic pipelines. For RE, LangGraph or a plain coding agent covers most needs with less ceremony. Unverified for production malware work.

### Microsoft Agent Framework

Docs: https://learn.microsoft.com/en-us/agent-framework/overview/

Microsoft Agent Framework is the successor to AutoGen and Semantic Kernel. The same teams built it. It ships in Python, .NET, and Go.

Components:

- Agents: LLM plus instructions plus tools. Supports Foundry, Anthropic, Azure OpenAI, OpenAI, Ollama.
- Workflows: functional and graph-based orchestration with explicit execution paths.
- Harness Agent: an opinionated agent for long multi-step tasks. It adds planning, todo tracking, context compaction, file memory, tool approval, and observability.
- Sessions, middleware, MCP clients, context providers.

AutoGen still exists at github.com/microsoft/autogen. New work should target Agent Framework. Migration guides exist for both predecessors.

RE fit: the Harness Agent pattern matches long-running RE sessions. Context compaction is built in. MCP client support is first-class. Niche for RE so far. Unverified on binary-analysis workloads.

## MCP-Based Tool Routing

MCP servers expose tools to any agent. The agent sees the tool list and picks calls. Two problems follow.

### Problem 1: tool count

A server like `bethington/ghidra-mcp` exposes 219 tools. A suite like `vmoranv/jshookmcp` exposes 735 tools across 36 domains. Loading every schema costs context on every turn.

Mitigations found in the wild:

| Pattern | Example | Effect |
|---|---|---|
| Code mode | Hex-Rays `ida-mcp` exposes `execute_python` plus a few tools | Agent writes IDAPython. About 20 percent fewer tokens per Hex-Rays' internal benchmark. Claim unverified independently. |
| Lazy tool loading | `bethington/ghidra-mcp` | Schemas load on demand. |
| Profile ladders | `jshookmcp` | Start with a small tool set. Expand only when needed. |
| Read-only defaults | `mrphrazer/ghidra-headless-mcp` | Write tools stay hidden until enabled. Safer and cheaper. |
| Per-subagent servers | Claude Code `mcpServers` frontmatter, Gemini CLI `mcpServers` frontmatter | Each subagent sees only its own servers. |

### Problem 2: tool poisoning

MCP tool descriptions are attacker-controlled text. Trail of Bits documented tool-poisoning attacks in April 2025. A malicious server can embed instructions in a tool description before the agent calls anything.

Rules for RE work:

- Vet every MCP server. Prefer official vendor servers.
- Run write-capable servers behind an allowlist. See `../07-advanced/ai-security-threats.md`.
- Treat decompiler output as untrusted data. Prompt injection through binary strings is documented.
- Use read-only modes for untrusted binaries.

## Feature Comparison for RE Work

| Tool | Context isolation | Parallel subagents | Long-running tasks | Checkpoints/resume | Write isolation | Cost control |
|---|---|---|---|---|---|---|
| Claude Code | Own context per subagent | Yes, background default | Yes, background + resume | `maxTurns` partial, resume | `isolation: worktree` | Per-subagent `model` field, `haiku` tier |
| Codex CLI | Own thread per subagent | Yes, configurable cap | Yes, inspectable threads | Session resume | Inherits parent sandbox | `model` per custom agent, `gpt-6-luna` tier |
| Cursor | Own context per subagent | Yes, Task calls | Yes, background + cloud VM | `is_background`, resumable IDs | Worktree or cloud branch | `model` field, billing pools per model |
| Gemini CLI | Own loop per subagent | Via delegation | `timeout_mins`, `max_turns` | Session resume | Shared filesystem | `model` field, `agents.overrides` |
| OpenAI Agents SDK | Runner loop per agent | Handoffs and tools | Sessions persist | Sessions, sandbox resume | Sandbox agents isolated | Model per agent |
| LangGraph | State per thread | Graph branches | Checkpointer persists | Checkpoints, time travel | Your design | Your design |
| CrewAI | Agent context | Crew collaboration | Flow state | Flow state | Your design | Your design |
| MS Agent Framework | Session state | Workflow graphs | Harness Agent designed for it | Sessions, state management | Your design | Your design |

## Cost Comparison Patterns

No public benchmark prices orchestration overhead directly. These patterns come from docs and measured RE costs.

### Per-subagent token multiplication

Codex docs state it plainly: subagent workflows consume more tokens than comparable single-agent runs. Each subagent pays for its own context gathering.

Cursor docs quantify the trade: five parallel subagents use roughly five times the tokens of one agent.

Claude Code docs note every subagent request counts toward the same usage limits.

Rule: parallelize read-heavy work. Serialize write-heavy work.

### Model tiering

The cheapest correct pattern assigns the weakest sufficient model per subagent.

| Harness | Cheap tier example |
|---|---|
| Claude Code | `model: haiku` for Explore-style scans |
| Codex CLI | `model = "gpt-6-luna"` for bounded scans |
| Cursor | Built-in explore uses a faster model by default |
| Gemini CLI | `model: gemini-3-flash-preview` in frontmatter |

### Measured RE costs

From the project research report:

| Source | Cost |
|---|---|
| DecBench | About $1.0 to $1.2 per function for gpt-6-astra agent runs. About $6.6 for claude-opus-4-8. |
| SRE-Bench | $0.50 to $42.5 per instance depending on model and safeguards. GPT-6-Astra $13.5. Claude Opus 5 $23.6. DeepSeek-V4.1-Flash $0.50 but 0.8 percent solved. |
| Kong XZ reconstruction | $6.63 for a full backdoor kill chain. |
| Claroty Team82 | $6 and 28 minutes for a controller vulnerability reproduction. |

Budget pattern: one cheap-model triage pass first. Escalate to a frontier model only for functions that survive triage.

## Setup

Minimal orchestration setup for RE:

1. Install Claude Code or Codex CLI.
2. Add the MCP server for your analysis tool. See `../05-tools/mcp-catalog.md`.
3. Write one subagent file for your most repeated bounded task.
4. Run one bounded task end to end.
5. Add a verification step. See `03-decomp/verification-loop.md`.

Example Claude Code subagent for batch rename proposals:

```markdown
---
name: rename-proposer
description: Proposes names for stripped functions from Ghidra output. Returns name, evidence, confidence.
tools: Read, Grep, Glob, mcp__ghidra__decompile_function, mcp__ghidra__get_xrefs
model: sonnet
maxTurns: 40
---

For each function in scope:
1. Decompile it.
2. Read its callers through xrefs.
3. Propose one name.
4. Cite the instruction or call that justifies the name.

Return a table. Never edit the database.
```

Invoke it: "Use rename-proposer on functions 0x401000 through 0x401200."

Example Codex custom agent for verification:

```toml
name = "re-verifier"
description = "Checks agent claims against the binary. Read-only."
developer_instructions = """
For every claim, find the bytes or the tool output that proves it.
Verdicts: confirmed, wrong, unverified.
No edits. No speculation.
"""
model = "gpt-6.1-sol"
model_reasoning_effort = "high"
```

## Pitfalls

- **Do not parallelize writes.** Parallel subagents editing one database or one checkout conflict. Cursor docs say it directly.
- **Do not skip verification.** Orchestration multiplies output. It also multiplies confident wrong answers. Half of cited functions in one agent RE report study were wrong.
- **Do not give every subagent every tool.** Wide tool surfaces cost context and widen the injection surface.
- **Do not trust subagent summaries blindly.** A subagent returns what it believes. Check claims against the binary.
- **Do not run untrusted binaries unsandboxed.** Subagents inherit the parent sandbox in Codex. They share the filesystem in Gemini CLI. Isolate the whole session.
- **Do not assume nested depth.** Claude Code allows three levels. Cursor allows two. Gemini CLI allows zero.
- **Do not let context rot accumulate.** Frameworks compact context and lose track of unfinished work. Keep an evidence ledger outside the agent. See `./context-engineering.md`.
- **Do not ignore per-subagent billing.** Cursor bills each subagent at its model's list price. Codex docs warn about token multiplication.
- **Do not install orchestration frameworks for one-off tasks.** A single coding agent with one MCP server covers most RE work.

## See Also

- `../05-tools/mcp-catalog.md` — MCP server choices per analysis tool
- `03-decomp/verification-loop.md` — deterministic verification patterns
- `../05-tools/skills-catalog.md` — skill packs that steer subagent behavior
- `./context-engineering.md` — context windows, compaction, ledgers
- `../07-advanced/ai-security-threats.md` — tool poisoning and sandboxing
- `../09-ops/cost-tracking.md` — measured per-task costs
