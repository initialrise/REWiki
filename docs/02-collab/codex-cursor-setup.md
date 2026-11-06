# Codex CLI, Cursor, and Other Harnesses for RE

> Tags: harnesses, codex-cli, cursor, gemini-cli, goose, aider, kimi-code, mcp, agents-md, skills | Difficulty: Intermediate | Prerequisites: `05-tools/mcp-catalog.md`, `05-tools/skills-catalog.md`, `01-setup/linux-sandbox-base.md`

## Overview

A harness is the program that hosts the model and its tools. In 2026 the main coding-agent harnesses all support MCP. The difference is where configuration lives, how strict the sandbox is, and whether the tool can run headless.

For reverse engineering work, the harness decides three things:

- Whether it can reach your MCP bridges to Ghidra, IDA, Binary Ninja, or x64dbg.
- Whether it can load the RE skill packs from `05-tools/skills-catalog.md`.
- Whether you can run it from scripts and CI pipelines.

This page covers five harnesses. Codex CLI from OpenAI. Cursor and its `agent` CLI. Gemini CLI from Google. Goose from the Agentic AI Foundation at the Linux Foundation. Aider. Kimi Code is mentioned briefly as the harness behind this wiki.

Pick the harness for the workflow, not for the model. The MCP servers and skills do the RE work. The harness only schedules it.

## Setup

### OpenAI Codex CLI

Codex CLI is the terminal agent from OpenAI. Install methods per https://github.com/openai/codex:

```bash
curl -fsSL https://chatgpt.com/codex/install.sh | sh
# or
npm install -g @openai/codex
# or
brew install --cask codex
```

Sign in with `codex`, then choose "Sign in with ChatGPT" or use `CODEX_API_KEY` for automation.

Codex stores all configuration in `~/.codex/config.toml`. A project can also hold `.codex/config.toml`, but Codex trusts project config only for trusted projects. See https://learn.chatgpt.com/docs/config-file/config-sample.

Add an MCP server with the CLI:

```bash
codex mcp add ghidra -- uvx --from git+https://github.com/LaurieWired/GhidraMCP ghidra-mcp
codex mcp list
```

The same server in `config.toml`:

```toml
[mcp_servers.ghidra]
command = "uvx"
args = ["--from", "git+https://github.com/LaurieWired/GhidraMCP", "ghidra-mcp"]
startup_timeout_sec = 30
tool_timeout_sec = 120
enabled_tools = ["list_functions", "decompile_function", "rename_function"]
disabled_tools = ["delete_function"]
default_tools_approval_mode = "prompt"

[mcp_servers.ghidra.tools.decompile_function]
approval_mode = "auto"
output_token_limit = 30000
```

Notes:

- `enabled_tools` is an allowlist. `disabled_tools` applies after it.
- `required = true` makes startup fail if the server is not ready. Use it for servers the task cannot work without.
- `startup_readiness = "catalog"` lets Codex start with a cached tool list while the server connects.
- `codex mcp login <name>` handles OAuth servers.
- Per-tool `approval_mode` values: `auto`, `prompt`, `writes`, `approve`.
- `bearer_token_env_var` and `http_headers` configure HTTP servers. See `mcp_servers.<name>.url`.

### Cursor

Cursor is an editor with an agent. The same agent ships as a terminal CLI called `agent`. Install per https://cursor.com/docs/cli/overview:

```bash
curl https://cursor.com/install -fsS | bash
agent
```

For scripts set `CURSOR_API_KEY`. For CI use the print mode described below.

MCP config lives in `mcp.json`. Project scope: `.cursor/mcp.json`. Global scope: `~/.cursor/mcp.json`. Format per https://cursor.com/docs/mcp:

```json
{
  "mcpServers": {
    "ghidra": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/LaurieWired/GhidraMCP", "ghidra-mcp"]
    },
    "idalib": {
      "url": "http://127.0.0.1:8745/mcp",
      "headers": { "Authorization": "Bearer ${env:IDA_MCP_TOKEN}" }
    }
  }
}
```

Notes:

- Cursor supports stdio, SSE, and Streamable HTTP transports.
- `${env:NAME}`, `${userHome}`, and `${workspaceFolder}` interpolate in command, args, env, url, and headers.
- Cursor asks for approval before MCP tool calls by default. This applies to Plan mode too.
- "Run Mode" (Auto-review) can route allowlisted MCP tools without prompts. Configure per server network mode: allow all, allowlist, deny all, or no sandbox.
- Team admins can distribute MCP servers and an MCP allowlist from the dashboard.

Project rules live in `.cursor/rules/*.mdc`. They use YAML frontmatter with `description`, `globs`, and `alwaysApply`. Keep each rule under 500 lines. `AGENTS.md` in the project root is also supported, including nested files. See https://cursor.com/docs/rules.

Example `.cursor/rules/re-workflow.mdc`:

```markdown
---
description: Reverse engineering workflow for this repository
alwaysApply: false
globs: "**/*.md, **/notes/**"
---

- Decompile with Ghidra MCP before claiming what a function does.
- Rename only with evidence from strings, xrefs, or call sites.
- Record every hypothesis with the address that supports it.
- Never mark a function "safe" or "malicious" without a verification step.
```

### Gemini CLI

Gemini CLI is the open-source terminal agent from Google. Install:

```bash
npm install -g @google/gemini-cli
# or
npx @google/gemini-cli
```

Important status note: the repository README states that free individual access and Google AI Pro/Ultra plans moved to "Antigravity CLI" on June 18, 2026. Gemini CLI is now positioned for Gemini Code Assist Standard/Enterprise licenses and legacy API/Vertex keys. See https://github.com/google-gemini/gemini-cli.

MCP servers go in `~/.gemini/settings.json`:

```json
{
  "mcpServers": {
    "ghidra": {
      "command": "uvx",
      "args": ["--from", "git+https://github.com/LaurieWired/GhidraMCP", "ghidra-mcp"]
    }
  }
}
```

Supports stdio, SSE, and Streamable HTTP transports. See https://github.com/google-gemini/gemini-cli/blob/main/docs/tools/mcp-server.md.

Context files use `GEMINI.md`, not `AGENTS.md`. The hierarchy is `~/.gemini/GEMINI.md`, then workspace `GEMINI.md` files found by walking up from the working directory, then just-in-time `GEMINI.md` files discovered when tools touch directories. `settings.json` can add `AGENTS.md` to `context.fileName`:

```json
{ "context": { "fileName": ["AGENTS.md", "GEMINI.md"] } }
```

Skills follow the agentskills.io standard. Discovery tiers, lowest to highest precedence: built-in, extension, `~/.gemini/skills/` and `~/.agents/skills/`, `.gemini/skills/` and `.agents/skills/` in the project. Manage with `/skills list` in session or `gemini skills install <repo>` from the shell. See https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/skills.md.

Sandbox: `gemini -s` or `GEMINI_SANDBOX=true`. Backends are Seatbelt on macOS or Docker/Podman containers that mount the project at the same path. See https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/sandbox.md.

### Goose

goose is the general-purpose agent from Block, now under the Agentic AI Foundation at the Linux Foundation. Repository: https://github.com/aaif-goose/goose. Install the CLI:

```bash
curl -fsSL https://github.com/aaif-goose/goose/releases/download/stable/download_cli.sh | bash
goose configure
```

Config file: `~/.config/goose/config.yaml` on Linux and macOS. `%APPDATA%\Block\goose\config\config.yaml` on Windows. Extensions are MCP servers. Enable one with `goose mcp <name>` or `goose configure` → Add Extension → Custom Extension. Remote servers take a URL. STDIO servers take a command.

Example `config.yaml` snippet:

```yaml
active_provider: anthropic
providers:
  anthropic:
    enabled: true
    model: claude-sonnet-4-5-20250929
    configured: true
GOOSE_MODE: smart_approve
GOOSE_MAX_TURNS: 100
extensions:
  developer:
    enabled: true
    type: builtin
  ghidra:
    enabled: true
    type: stdio
    cmd: uvx
    args: ["--from", "git+https://github.com/LaurieWired/GhidraMCP", "ghidra-mcp"]
    timeout: 300
```

Verify the exact `extensions` schema against `goose configure` output for your version. The docs describe the UI flow more than the YAML shape. Mark this snippet as approximate.

Permission modes: `auto` (fully autonomous, the default), `approve` (ask before every tool), `smart_approve` (risk-based), `chat` (no tools). Set `GOOSE_MODE` or use `/mode` in session. See https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/managing-tools/goose-permissions.md.

Skills use the agentskills.io standard. Locations: `~/.agents/skills/`, `.agents/skills/` in the project, plugin skills. Also reads `.goose/skills/`, `.claude/skills/`, and `~/.claude/skills/` for compatibility. List with `goose skills list` or `/skills` in session. See https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/context-engineering/using-skills.md.

Context: goose loads `.goosehints` files at session start and nested hints as discovered. For per-turn guardrails use `GOOSE_MOIM_MESSAGE_FILE` pointing at a markdown file re-read every turn. There is no first-class AGENTS.md loader, but the Codex session import path reads AGENTS.md and goose hints can point at instruction files. See https://github.com/aaif-goose/goose/blob/main/documentation/docs/guides/context-engineering/using-goosehints.md.

### Aider

Aider is a terminal pair-programming tool. Install:

```bash
python -m pip install aider-install
aider-install
```

Config lives in `.aider.conf.yml` at repo root or `~/.aider.conf.yml`, plus `AIDER_*` environment variables. Docs: https://aider.chat/docs/config.html.

Important: Aider has no MCP client. I verified this against the source tree at github.com/Aider-AI/aider. No MCP code or config exists in the repo as of November 2026. The earlier report claim that "MCP support exists but thinner" is wrong. Treat Aider as file-and-shell only.

What Aider does have:

- A repository map (`--map-tokens`) that summarizes the codebase for the model.
- `/run <cmd>` to run shell commands and feed output into the chat.
- `/read <file>` to load files read-only, including files outside the repo.
- Architect mode (`--architect`) with a separate editor model.
- Git integration: every AI change is a commit. `/undo` reverts.
- `.aiderignore` (gitignore syntax) and `.aider.conventions.md` for project rules.

Conventions file example, `.aider.conventions.md`:

```markdown
- This is a reverse-engineering notes repository, not a code project.
- Address references must use hex format like `sub_401000` or `0x401000`.
- Never invent function names. Use `FUN_` or `sub_` prefixes from the decompiler.
- Prefer short factual answers. Mark hypotheses with "hypothesis:".
```

Use Aider for editing writeups, generating scripts, and annotating exports. Do not use it as the RE agent. Pair it with a harness that has MCP.

### Kimi Code

Kimi Code is the harness running this wiki. It supports MCP servers and the agentskills.io skill format. Kimi models offer a 1M-token context window, which suits large decompilation dumps. See https://www.kimi.com for current docs.

## Step-by-Step

### Wire one RE MCP server into each harness

Use the same GhidraMCP server everywhere. Change only the config format.

1. Start Ghidra with the GhidraMCP plugin, or run `ghidra-mcp` standalone per its README.
2. Codex: `codex mcp add ghidra -- uvx --from git+https://github.com/LaurieWired/GhidraMCP ghidra-mcp`. Verify with `codex mcp list`.
3. Cursor: create `.cursor/mcp.json` with the `mcpServers` block above. Restart the agent. Type `/mcp` in chat to see the server.
4. Gemini CLI: add to `~/.gemini/settings.json`. Verify with `gemini` then ask it to list MCP tools.
5. Goose: `goose configure` → Add Extension → Custom Extension → STDIO. Or edit `config.yaml` directly.
6. Aider: skip. No MCP.

### Choose sandbox strictness per task

Tightest first. Loosen only when the tool needs it.

- Codex: `sandbox_mode = "read-only"` in `config.toml`, or `--sandbox read-only` on `codex exec`. `workspace-write` allows edits in the project. `danger-full-access` disables the sandbox. Approval policy `on-request` asks before escalations.
- Cursor agent CLI: `--sandbox enabled` or `disabled`. In the editor, Run Mode controls tool approvals.
- Gemini CLI: `-s` flag or `GEMINI_SANDBOX=true` for container isolation. `--approval-mode` controls prompting.
- Goose: `GOOSE_MODE=approve` for manual approval, `smart_approve` for risk-based, `auto` for full autonomy. Default is `auto`, which is dangerous on untrusted binaries.
- Aider: no sandbox. It edits files directly and commits to git. Run it in a throwaway clone or a container.

### Run headless for batch work

- Codex: `codex exec "task" --sandbox workspace-write --json`. Output is JSONL on stdout. Use `--output-schema` for structured results, `-o file` for the last message, `--ephemeral` to skip session files, `--skip-git-repo-check` outside repos.
- Cursor agent CLI: `agent -p "task" --force --output-format stream-json`. `--force` allows file edits. `text`, `json`, and `stream-json` output formats exist.
- Gemini CLI: `gemini -p "task" --output-format json` or `stream-json`. Sandbox with `-s`. Exit codes: 0 success, 1 error, 42 input error, 53 turn limit.
- Goose: `goose run -t "task"`. Use `--no-session` for one-shot jobs. Set `GOOSE_MODE=auto` and `GOOSE_MAX_TURNS`. Recipes (`.yaml` files with a `prompt` field) package multi-step workflows.
- Aider: `aider --message "task" --yes --no-auto-commits file1 file2`. `--dry-run` previews. Python API exists but is not officially supported.
- Kimi Code: supports non-interactive invocation. Check `kimi --help` for the current flags.

### Write a portable RE instruction file

Create `AGENTS.md` at the analysis workspace root. Codex, Cursor, Goose hints, and Kimi Code read it. Gemini CLI reads `GEMINI.md` or `AGENTS.md` if configured.

```markdown
# Reverse Engineering Workspace

## Tools
- Ghidra MCP on stdio via `ghidra-mcp`. Binary Ninja MCP on http://127.0.0.1:24642/mcp.
- x64dbg MCP on http://127.0.0.1:9094 for live debugging.

## Rules
- Decompile before you theorize. Cite function addresses.
- Mark every claim as FACT (seen in disassembly) or HYPOTHESIS (inferred).
- Never execute the sample. Analysis is static plus debugger only.
- Keep a findings log in findings.md. Update it every turn.
- When context runs low, write state to state.md and summarize.
```

### Compose a batch decompile job

Per `03-decomp/batch-decompilation.md`, the pattern is: list targets, fan out to workers, collect structured output.

```bash
# Codex version
cat targets.txt | while read bin; do
  codex exec --ephemeral --sandbox read-only --json \
    "Triage $bin with Ghidra MCP. Output JSON: {sha256, arch, packer, entry, interesting_strings[], verdict}" \
    > "out/$(basename $bin).jsonl"
done
```

Same shape works with `agent -p --output-format json`, `gemini -p --output-format json`, and `goose run -t` piped to a file. Pick the harness whose model you trust for triage.

## Pitfalls

- **Aider cannot call MCP tools.** Verified against source. If a tutorial shows Aider driving Ghidra MCP, it is using a wrapper or the claim is wrong. Use `/run` to call a CLI tool and `/read` to feed output back manually.
- **Codex project config requires trust.** `.codex/config.toml` in a cloned repo loads only after you trust the project. An untrusted binary-analysis repo will silently ignore its MCP config.
- **Cursor MCP approval prompts break headless runs.** `agent -p` without `--force` proposes changes but does not apply them. MCP tool calls still prompt unless the server is allowlisted or Run Mode auto-approves.
- **Gemini CLI auth changed in 2026.** Free and consumer Google AI plans moved to Antigravity CLI. If `gemini` fails auth, check which surface your key belongs to.
- **Goose defaults to `GOOSE_MODE=auto`.** Full autonomy on a malware sample is reckless. Set `approve` or `smart_approve` and restrict extensions.
- **MCP servers are part of the attack surface.** A poisoned Ghidra MCP config can exfiltrate your binary or inject prompts. Vet servers per `07-advanced/ai-security-threats.md`. Use `enabled_tools` allowlists. Prefer read-only tool exposure where the server supports it.
- **Context files have size caps.** Codex truncates AGENTS.md at 32 KiB by default (`project_doc_max_bytes`). Goose hints cap persistent instructions at 64 KB. Split large guidance into per-directory files.
- **`--full-auto` is gone in Codex.** Scripts using it fail. Use `--sandbox workspace-write` or `--approve-for-me`.
- **Skill directories differ per harness.** Codex uses `.agents/skills/` and `.codex/skills/`. Cursor reads `.cursor/skills/`, `.agents/skills/`, plus `.claude/` and `.codex/` aliases. Gemini CLI reads `.gemini/skills/` and `.agents/skills/`. Goose reads `.agents/skills/` and `.goose/skills/`. Put RE skills in `.agents/skills/` for maximum portability.
- **Model names in examples age fast.** The config samples name `gpt-6.1-sol` and `claude-sonnet-4-5-20250929` because those were current at writing. Check `codex --help` and provider docs for current IDs.
- **Headless modes still burn tokens.** A `codex exec` loop over 500 binaries is 500 agent sessions. Budget context and cost before scaling. See `07-advanced/model-selection.md`.

## See Also

- `../05-tools/mcp-catalog.md` — full MCP server list for IDA, Ghidra, Binary Ninja, debuggers.
- `../05-tools/skills-catalog.md` — RE skill packs and the agentskills.io format.
- `../02-collab/claude-code-setup.md` — sibling page for the Claude Code harness.
- `../02-collab/multi-agent-patterns.md` — subagent patterns that work across harnesses.
- `../02-collab/agent-orchestration-tools.md` — when to pick a harness versus a framework.
- `../03-decomp/batch-decompilation.md` — batch patterns for headless harness runs.
- `../03-decomp/verification-loop.md` — deterministic checks to pair with agent output.
- `../01-setup/linux-sandbox-base.md` — OS-level isolation under the harness sandbox.
- `../07-advanced/ai-security-threats.md` — prompt injection and MCP supply-chain risks.
