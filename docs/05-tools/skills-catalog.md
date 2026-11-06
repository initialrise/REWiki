# Agent Skills Catalog for RE

> Tags: agent skills | MCP | workflow | harness | Difficulty: Intermediate | Prerequisites: [linux-sandbox-base](../01-setup/linux-sandbox-base.md) or a working Claude Code, Codex, or Kimi Code install

## Overview

An agent skill is a directory that teaches an AI coding agent how to do one job well. The agent reads the skill before it acts on your task. This page covers the skill format, the best reverse engineering skill collections available in 2026, and how to write your own.

Skills work without an MCP server. An MCP server gives the agent tools. A skill gives the agent procedure. Most serious RE setups use both. The MCP server exposes Ghidra, IDA, or r2 functions. The skill tells the agent when to call them and what order to use them in.

The format is an open standard at https://github.com/agentskills/agentskills. Anthropic open-sourced it. Claude Code, Codex, Cursor, Copilot, Gemini, Windsurf, and Kimi Code all support it. Skills from one harness usually work in the others.

Use a skill pack instead of a hand-written prompt when:

- The task touches more than one tool. Example: APK triage needs jadx, then apksigner, then Frida.
- You want a fixed evidence contract. Skills can require every finding to cite an offset or address.
- You run the same workflow on many samples and want one place to fix it.

Do not use a skill pack for a single one-off task. The routing overhead costs context tokens. A plain prompt is faster.

### Progress in one year

The ecosystem moved fast. In early 2026 the main approach was MCP servers plus AGENTS.md files. By late 2026 skill packs with hundreds of modules exist. The largest Chinese-first collection claims 122 skills. The largest English router pack claims about 45 modules and 44 routing rules.

Popularity numbers on GitHub are unreliable in this space. One RE skill repository reports a star count near 430,000 on a repository created in April 2026. Treat every count as approximate. Judge a pack by its content, not its stars.

## How It Works

### The skill format

A skill is a directory with a `SKILL.md` file and optional subdirectories:

```
my-re-skill/
├── SKILL.md          # required: YAML frontmatter + markdown instructions
├── scripts/          # optional: executable helpers the agent can run
├── references/       # optional: detailed docs loaded on demand
└── assets/           # optional: templates, lookup tables, sample data
```

`SKILL.md` has two parts. YAML frontmatter holds metadata. The markdown body holds the instructions.

Frontmatter fields per the specification at https://github.com/agentskills/agentskills/blob/main/docs/specification.mdx:

| Field | Required | Rule |
|---|---|---|
| `name` | Yes | 1 to 64 characters. Lowercase letters, numbers, hyphens. Must match the directory name. No leading, trailing, or double hyphens |
| `description` | Yes | 1 to 1024 characters. Must say what the skill does and when to use it. Include trigger keywords |
| `license` | No | License name or a reference to a bundled license file |
| `compatibility` | No | Max 500 characters. Environment requirements. For example "Requires Ghidra 12 + Java 21" |
| `metadata` | No | Arbitrary string key-value pairs |
| `allowed-tools` | No | Space-separated pre-approved tools. Experimental |

Minimal example:

```markdown
---
name: pe-triage
description: Triages a Windows PE binary — strings, imports, packer detection, entropy sections. Use when a sample is a .exe or .dll and you need first-pass facts before deep analysis.
---
```

### Progressive disclosure

The agent does not load the whole skill at once. It loads in three stages:

1. **Metadata.** Name and description load at startup for every installed skill. Cost is about 100 tokens per skill. This is why the description must be specific. Vague descriptions cause wrong activations.
2. **Instructions.** The full `SKILL.md` body loads when the skill activates. Keep it under 500 lines or about 5,000 tokens. Past that, context cost grows and instruction-following degrades.
3. **Resources.** Files in `scripts/`, `references/`, and `assets/` load only when the agent needs them.

This is the main design constraint. Put the routing table and the happy path in `SKILL.md`. Put long procedures, per-arch details, and command references in `references/*.md`. Keep each reference file focused so the agent loads less context per lookup.

### Validation and install

Validate a skill before you ship it:

```bash
git clone https://github.com/agentskills/agentskills
cd agentskills/skills-ref
skills-ref validate ./my-skill
```

Install skills with Vercel's skills CLI (skills.sh):

```bash
npx skills add <repo-or-skill-path>
```

`npx skills add` scans a repository for `SKILL.md` files and copies them into the client skill directory. The skills.sh registry tracks install counts and security audits. For Claude Code, skills also live under `~/.claude/skills/` or `.claude/skills/` in a project. For Codex, the convention is `~/.codex/skills/` or `.agents/skills/`. Check your client's docs for the exact path.

## Step-by-Step

### 1. Pick a pack that matches your stack

Start with one pack, not five. Two large packs will fight over the same tasks and burn context on routing.

| Pack | Repo | Size | Notes |
|---|---|---|---|
| reverse-skill | github.com/zhaoxuya520/reverse-skill | About 45 modules, 44 routing rules | English and Chinese. Router plus per-domain skills. APK, iOS, IDA, radare2, Binary Ninja, .NET, JS, firmware, malware, CTF. Ships a 175-case regression benchmark |
| rev-skills | github.com/dslsdzc/rev-skills | 122 skills, verified by counting `.claude/skills/*/SKILL.md` | Chinese-first, with an English README at README_EN.md. Entry skill `re-analyze` routes through gateway `re-binary-core` to atomic per-tool skills |
| rekit | github.com/batteryshark/rekit | 53 SKILL.md files plus a registry.json manifest | Harness-agnostic. Each skill declares prerequisites, safety tier, and a runnable entry command. Has an MCP server mode |
| wshobson/agents | github.com/wshobson/agents | Large cross-harness marketplace | Multi-harness plugin marketplace. The `plugins/reverse-engineering` plugin ships skills such as `protocol-reverse-engineering`, `anti-reversing-techniques`, `binary-analysis-patterns`, and `memory-forensics` |
| r0crawl_skills | github.com/manyuegong33/r0crawl_skills | 196 modules claimed | Codex-oriented. Bundled runnable helpers. Claims unverified |

The reverse-skill router deserves detail. Its rules live in `skills/config/routing.json` as the single source of truth, not in prose. The router script is `skills/scripts/master-route.sh --hint "<task>"` on Linux or `master-route.ps1` on Windows. It maps a task hint to one primary skill. `skills/routing.md` is an advisory matrix, not the decision path. This separation — machine-readable rules, advisory prose — is the pattern to copy.

The rekit pack takes a different approach. Its `registry.json` gives every skill a structured manifest: name, description, version, capabilities, prerequisites with install hints, and a safety block that states whether the skill executes input and whether it needs network. That manifest is what a harness or a wrapper script can query without loading any SKILL.md. If you build your own catalog, copy this idea.

### 2. Pick domain packs

Add packs only for the targets you actually see.

**Ghidra skills:**

| Pack | Repo | Content |
|---|---|---|
| reverse-engineering-assistant | github.com/cyberkaida/reverse-engineering-assistant | ReVa skill family: `binary-triage`, `deep-analysis`, `pyghidra-scripting`, `ctf-rev`, `ctf-pwn`, `ctf-crypto`. Reference-quality tool-choice heuristics and explicit "do not use when" boundaries |
| ghidra-skill-for-dsh | github.com/Cristallin2006/ghidra-skill-for-dsh | Built for the DeepSeek harness. Persistent headless Ghidra daemon plus nine skills: triage, unpack, decompile, dynamic, pwn, traffic analysis, APK, vuln audit, core. Circuit breakers that stop agent failure loops |
| headless-ghidra | github.com/ByteLandTechnology/headless-ghidra | Eight-skill phased workflow: P0 intake, P1 baseline, P2 evidence, P3 discovery, P4 batch decompile |
| ghidrasql-skills | github.com/0xeb/ghidrasql-skills | Skills for the ghidrasql live SQL interface to Ghidra |
| ghidra-cli | github.com/akiselev/ghidra-cli | Ships `docs/skills/ghidra-cli/SKILL.md`. Example of pairing a CLI with a first-party skill |

**IDA skills:**

| Pack | Repo | Content |
|---|---|---|
| ida-reverse-engineering-skill | github.com/Newmcpe/ida-reverse-engineering-skill | Drives IDA through MCP. Rename, retype, struct recovery |
| claude-reverse-skills | github.com/haikow/claude-reverse-skills | Five skills: ida-reverse, apk-reverse, radare2, reverse-engineering, mcp-js-reverse-playbook |
| reverse-skills | github.com/P4nda0s/reverse-skills | rev-idapython, rev-ios-dump, rev-u3d-dump, rev-frida, rev-unicorn-debug |
| x64dbg-skills | github.com/dariushoule/x64dbg-skills | Claude Code plugin for x64dbg automation |

**Mobile skills:**

| Pack | Repo | Content |
|---|---|---|
| android-reverse-engineering-skill | github.com/SimoneAvogadro/android-reverse-engineering-skill | APK decompile workflow. R8 Kotlin-name recovery. API extraction |
| MobileRE-Skill | github.com/index-login/MobileRE-Skill | Mobile RE skill system. 25 Frida modules claimed. Unpacking pipeline. Dex-to-C handoff. Chinese-first README with English version |
| ai-mobile-reverse-skills | github.com/Fausto-404/ai-mobile-reverse-skills | Six-phase mobile pentest pipeline. Machine-readable phase contracts. Guardian grading |
| iOS-reverse-engineering-claude-skill | github.com/incogbyte/iOS-reverse-engineering-claude-skill | iOS IPA and Mach-O skill. ipsw class-dump. 14-category static audit |

**CTF skills:**

| Pack | Repo | Content |
|---|---|---|
| ctf-skills | github.com/ljagiello/ctf-skills | CTF suite. The `ctf-reverse` skill has 22 files covering VMs, WASM, Go, Rust, and Android reversing |
| Anthropic-Cybersecurity-Skills | github.com/mukul975/Anthropic-Cybersecurity-Skills | 818 cybersecurity skills claimed. Many malware-analysis skills. Mapped to ATT&CK and NIST |

**Malware skills:**

| Pack | Repo | Content |
|---|---|---|
| agentic-malware-analysis | github.com/mrphrazer/agentic-malware-analysis | Malware triage orchestrator skill. Kali Docker environment. 50+ tools. Case-directory artifact contract |
| malware-analysis-claude-skills | github.com/gl0bal01/malware-analysis-claude-skills | Five skills: triage, dynamic analysis, detection engineering, reporting, file analyzer |
| re-shell | github.com/schlarpc/re-shell | Nix dev-shell packaging the RE toolchain plus per-filetype skills |

**Bundled skill inside a tool repo:**

- **morluto/rea** — `npx rea-agents setup` installs the `reverse-engineer-anything` skill under `.agents/skills/`. It ships a routing table and eight reference files covering Android, JavaScript, native artifacts, runtime observation, evidence workflows, environments, and connection recovery. REA itself is a full agent harness with 60+ in-process tools, not only a skill. Independent evaluations (rea-lab, leanrea) found no significant solve-rate gain over plain agents at about 2x cost, per prior research. Use it for targeted questions, not open-ended exploration.

### 3. Install

```bash
# scan and install a whole repository's skills
npx skills add zhaoxuya520/reverse-skill
npx skills add batteryshark/rekit

# or copy manually for a project-local install
mkdir -p .claude/skills
cp -r /path/to/repo/skills/ghidra-decompile .claude/skills/
```

Project-local skills override or extend user-level skills depending on the client. Keep personal RE skills in the user directory and team-shared ones in the repo.

### 4. Wire the skill to real tools

A skill that says "run Ghidra" fails if the MCP server is not connected. Check your client's MCP config before blaming the skill. For Claude Code, MCP servers go in `.mcp.json` or `claude mcp add`. For Codex, they go in `~/.codex/config.toml` under `[mcp_servers]`.

Good skill repos state their tool assumptions in `compatibility` or in the body. reverse-skill keeps a shared `tool-index.md` as the single source of truth for which tools exist on your machine. If another CLI already installed a tool, the pack does not reinstall it.

### 5. Validate before you trust

Run a known target through the skill and check the output:

1. Give the agent a crackme or a CTF binary with a known flag.
2. Require the final answer to cite an address or offset.
3. If the skill produces plausible prose without citations, the evidence contract is too weak. Edit the SKILL.md.

reverse-skill ships a 175-case regression benchmark for exactly this reason. rekit's registry.json `safety` blocks let you audit which skills execute input or need network before you install them.

### 6. Write your own skill

Copy the anatomy of a good pack. The best RE skills share six traits:

1. **A routing table.** Map target type to first tool. Example: "APK goes to jadx-mcp. PE goes to ida-mcp. Firmware goes to binwalk, then Ghidra."
2. **Explicit non-goals.** State what the skill does not do. Example: "Do not use this skill for source-code review." Non-goals prevent wrong activations and scope creep.
3. **An evidence contract.** Require findings to cite file offsets, virtual addresses, or tool output. Without this the agent writes confident prose over guesses.
4. **Connection recovery.** Tell the agent what to do when the MCP server is down. Example: "If ida-mcp fails to connect, fall back to r2 pipe commands and note the degradation."
5. **References on demand.** Put long procedures in `references/*.md`, not in the SKILL.md body. Keep `SKILL.md` under 500 lines.
6. **A verification step.** End every workflow with a deterministic check. Example: "Re-run the decompiler on the patched bytes and confirm the branch flips."

Minimal skeleton:

```markdown
---
name: my-pe-triage
description: First-pass triage of a Windows PE — packer check, section entropy, import anomalies, suspicious strings. Use when handed a .exe/.dll and asked what it does.
compatibility: Requires python3, capa or floss optional, pefile.
---

# PE triage

## Non-goals
- Do not use for .NET assemblies. Route to the dotnet skill.
- Do not decompile. This skill produces facts only.

## Routing
- Packed section detected → stop. Report the packer. Do not decompile.
- Clean PE → run scripts/triage.py <file>, then read references/packer-signatures.md for matches.

## Evidence contract
Every claim cites: file offset, section name, or tool output line. No claims from strings alone.

## Recovery
If scripts/triage.py fails, run `objdump -x` and continue manually. Note the fallback in the report.

## Verify
Re-check the top finding with a second tool (capa or floss) before reporting.
```

Then add `scripts/triage.py` with real commands, and `references/` files for anything long. Validate with `skills-ref validate`. Test on three known binaries before you share it.

### 7. Publish or stay local

Push the skill directory to a GitHub repo. `npx skills add` can install from any public repo. skills.sh lists community packs and tracks installs. For private work, keep skills in a private repo and install from the local path. Do not commit target binaries, decrypted payloads, or client-confidential findings into a skill — skills are instructions, not evidence stores.

## Pitfalls

- **Too many packs installed at once.** Every skill costs about 100 tokens of description at startup. Thirty packs is 3,000 tokens before you ask anything, and vague descriptions cause wrong activations.
- **SKILL.md over 500 lines.** The body loads fully on activation. Long files burn context and dilute instruction-following. Move detail to `references/`.
- **Vague descriptions.** "Helps with binaries" activates on everything. Write what it does and when to use it, with trigger keywords.
- **Skills that assume tools you do not have.** Read the `compatibility` field and the body before installing. reverse-skill maintains a tool-index for this reason.
- **Chinese-first packs.** rev-skills, MobileRE-Skill, and manyuegong33/r0crawl_skills are Chinese-first. The content is usable but you will translate as you read. Check for an English README first.
- **Star counts and benchmarks.** GitHub stars in this niche are unreliable. One pack claims hundreds of thousands of stars on a months-old repo. Benchmark claims like the 175-case suite are self-reported. Verify on your own targets.
- **Skills as a substitute for judgment.** A skill encodes a workflow, not expertise. On novel packers or anti-analysis, the agent still needs you to recognize when the workflow is wrong. See [deobfuscation](../06-topics/deobfuscation.md) and [model-selection](../07-advanced/model-selection.md).
- **Prompt-injection surface.** Skills loaded from untrusted repos are instructions the agent will follow. Audit `scripts/` for network calls and exfiltration before installing third-party packs. The rekit `safety` manifest is a good model for what to check.
- **Version drift.** Tool versions move fast. A skill written for Ghidra 11 may call APIs that changed in Ghidra 12.2. Pin tool versions in `compatibility` and test after upgrades.

## See Also

- [verification-loop](../03-decomp/verification-loop.md) — verify agent output against ground truth
- [model-selection](../07-advanced/model-selection.md) — pick the model that drives the skills
- [agent-orchestration-tools](../02-collab/agent-orchestration-tools.md) — harnesses that load skills
- [apple-ios-re](../06-topics/apple-ios-re.md) — domain skills for iOS targets
- [firmware-iot-re](../06-topics/firmware-iot-re.md) — firmware skills and toolchains
- https://github.com/agentskills/agentskills — the open skill specification
- https://skills.sh — community registry and installer
- https://github.com/zhaoxuya520/reverse-skill — largest English/Chinese router pack
- https://github.com/batteryshark/rekit — manifest-driven harness-agnostic catalog
