# Sandboxing the Agent Itself

> Tags: isolation, security, docker, gvisor, kata, firecracker, nsjail, mcp-gateway, prompt-injection | Difficulty: Intermediate | Prerequisites: Docker basics, MCP server configuration, threat model for prompt injection (see `../07-advanced/ai-security-threats.md`)

## Overview

You feed an untrusted binary to an agent. Strings, decompiled code, and section names inside that binary can contain text written by an attacker. An agent reads that text as tool output. The text can then issue instructions that the agent follows.

The agent is the attack surface. Tool output from Ghidra, radare2, or a decompiler is untrusted data. A compromised agent can run commands, exfiltrate files, or write persistent poison back into your analysis database.

Sandbox the agent the same way you sandbox the malware.

## The Threat: Prompt Injection From Binaries

Research on AI-assisted reverse engineering now documents prompt injection as a working attack class. Reported results:

| Attack | Source | Reported result |
|---|---|---|
| Strings compiled into the binary mimic chat tokens | arXiv 2605.30667 | Injection strings survive compilation. Fake decompiler output for a different target. 100 percent success against Qwen3-8B in the study |
| Obfuscated injection | arXiv 2605.30677 | Non-printing bytes hide payloads from `list_strings` while `decompile_function` still shows them |
| Representation confusion | arXiv 2607.12507 | Binary strings promoted to instruction authority. Provenance-blind gates validated 32 of 32 false claims |
| Semantic reframing | arXiv 2609.19722 (ALIBI) | A non-executed PE section carries a false "security product" narrative. 85.7 percent success on Gemini 2.5 Pro |
| CAIRN A3 | Cisco Talos, October 2026 | Four malware families spray template payloads in seven LLM chat formats. Best techniques steered 35 percent of runs toward benign classification |
| Ghidra CFStrings RCE | GHSA-mc3p-mq2p-xw6v | Malicious Mach-O strings with `{@execute}` annotations. Arbitrary code execution when comments are clicked. Fixed in Ghidra 12.0.3 |

Two properties make this different from web prompt injection:

1. **Persistence.** The payload lives inside the artifact under analysis. It survives re-runs, project saves, and shared databases.
2. **Authority.** Decompiler output looks like authoritative analysis data. Models treat it as ground truth more readily than scraped web text.

The Skynet malware sample (Check Point Research, June 2025) is reported as the first documented malware with embedded prompt injection aimed at AI analysis tooling.

## The Sandbox Layers

Defense in depth. No single layer is sufficient.

```
┌─────────────────────────────────────────────────────┐
│  Agent + MCP servers (per-session container)        │
│  ┌───────────────────────────────────────────────┐  │
│  │  gVisor runsc / Kata microVM / nsjail         │  │
│  │  read-only evidence mounts, no egress or      │  │
│  │  egress allowlist, tool allowlists            │  │
│  └───────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────┐  │
│  │  Input firewall: PromptGuard, AgentSeal        │  │
│  │  scan, provenance tagging                     │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

### Layer 1: Per-Session Container

Run each analysis session in a fresh container. No production credentials inside. One session per binary or per target family.

```bash
# Minimal analysis sandbox. Throwaway, no network by default.
docker run --rm -it \
  --network none \
  --read-only \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --pids-limit 512 \
  --memory 8g \
  --tmpfs /tmp:rw,noexec,nosuid,size=2g \
  -v "$PWD/evidence:/evidence:ro" \
  -v "$PWD/work:/work" \
  -e HTTP_PROXY=http://proxy:3128 \
  -e HTTPS_PROXY=http://proxy:3128 \
  re-sandbox:latest
```

Rules:

- Mount the evidence directory read-only. The agent must not modify the binary under analysis.
- Give the agent one writable working directory for reports and scripts.
- Never mount `~/.ssh`, `~/.aws`, or API key directories into the container.
- Destroy the container after the session. Persist only the report output.

### Layer 2: Runtime Isolation

Docker shares the host kernel. A kernel exploit escapes plain containers. Pick a stronger runtime when the sample is hostile.

| Runtime | Isolation | Snapshot | Agent fit | Notes |
|---|---|---|---|---|
| Docker | Namespaces plus cgroups. Shared kernel | No native snapshots | Full CLI and API | Cheapest. Acceptable for trusted samples |
| gVisor `runsc` | Userspace kernel (Sentry). Intercepts syscalls | No checkpoint/restore | OCI runtime drop-in. No code changes | Strong against kernel exploits. Some syscall gaps for exotic binaries |
| Kata Containers | One VM per container. QEMU, Cloud-Hypervisor, or Firecracker | VM snapshot semantics | Standard OCI APIs | Heavier. Needs KVM or a cloud VM |
| Firecracker microVM | KVM microVM. Minimal device model | Snapshot/restore supported | REST API plus vsock | Strongest isolation. You manage the VM lifecycle yourself |
| nsjail | Namespaces plus cgroups plus seccomp-bpf. Process level | No | CLI plus protobuf config | No container image overhead. Good for running a single tool |

Choose by threat level:

- **Trusted internal samples:** Docker with `--network none`.
- **Unknown third-party binaries:** gVisor `runsc`.
- **Malware or packed samples:** Kata Containers or Firecracker microVM.
- **One tool under agent control:** nsjail for the tool process.

Enable gVisor per-container without changing your setup:

```bash
# Install runsc, then tag the container runtime.
docker run --runtime=runsc --rm -it re-sandbox:latest
```

Kata as a Docker runtime:

```bash
docker run --runtime=kata --rm -it re-sandbox:latest
```

### Layer 3: Network Egress Restrictions

The agent must not be able to send the binary contents, decompiled output, or secrets anywhere.

Three patterns, weakest to strongest:

1. **No network at all.** `--network none`. The agent cannot call cloud models. Use a local model. Report claims this removes exfiltration and provider leakage entirely. Cost: local models are weaker and more injectable.
2. **Egress allowlist proxy.** Point `HTTP_PROXY`/`HTTPS_PROXY` at a filtering proxy. Allow only the model API endpoint. Block all other hosts. Log every request.
3. **Model-in-container.** Run a local model (Ollama, vLLM, llama.cpp) inside the sandbox. No proxy needed. No data leaves the box.

Example proxy allowlist with Squid:

```
acl allowed dstdomain api.anthropic.com api.openai.com
http_access allow allowed
http_access deny all
```

For MCP servers, note that a networked MCP server is itself a tool. Give each MCP server only the egress it needs.

### Layer 4: Tool Allowlists

Reduce the tools the agent can call during untrusted-binary sessions.

- Disable write tools in Ghidra and Binary Ninja MCP servers. Comment write-back is a documented persistent injection channel (GhidraMCP issues #140/#141).
- Disable shell tools unless the session needs them.
- Allow only read-oriented tools: `decompile_function`, `list_strings`, `list_functions`, `get_xrefs`.

Docker MCP Gateway implements per-server tool allowlists. Enable or disable tools with dot notation:

```bash
# Create a profile with only the servers you need.
docker mcp profile create --name re-analysis \
  --server catalog://mcp/docker-mcp-catalog/github

# Allow only the tools you trust. Everything else stays disabled.
docker mcp profile tools re-analysis \
  --enable ghidra.decompile_function \
  --enable ghidra.list_strings \
  --enable ghidra.list_functions \
  --enable ghidra.get_xrefs

# Run the gateway. The agent connects to one endpoint.
docker mcp gateway run --profile re-analysis
```

See `../05-tools/mcp-catalog.md` for gateway setup in depth.

### Layer 5: MCP Server Sandboxing

MCP servers run with your user privileges by default. A malicious or compromised MCP server can read `~/.ssh`, exfiltrate code, or run shell commands. mcpjail (mcpjail.com) wraps any MCP server command in a hardened Docker container with a Rust protocol proxy:

```bash
# Read-only policy: server sees only /workspace, no network, no writes.
mcpjail --policy readonly \
  npx -y @modelcontextprotocol/server-filesystem /workspace

# Allow one host for a server that needs an API.
mcpjail --allow-host api.example.com python -m my_mcp_server

# Mount the evidence dir read-only.
mcpjail --mount "$PWD/evidence:/workspace:ro" --policy strict my-server
```

mcpjail policies ship as presets: `strict` (no network, no writes, blocks dangerous tools), `readonly` (read but not modify), `development` (writes in project dir, localhost allowed), `network-isolated` (full local access, no egress). Custom YAML policies give per-tool blocklists and per-path mounts.

mcpjail claims an audit of 501 servers from the official MCP registry found exploitable issues in nearly every server, including 380 with arbitrary file read or write patterns. Treat those numbers as vendor-reported, but the direction is consistent with the Trail of Bits tool-poisoning disclosure (April 2025) and Microsoft's rug-pull disclosure (April 2025).

### Layer 6: Input Filtering

Scan tool output before the model sees it.

**LlamaFirewall** (github.com/meta-llama/PurpleLlama/tree/main/LlamaFirewall) provides scanners you can compose in a policy engine:

- **PromptGuard 2**: a BERT-style classifier that detects direct prompt injection in user input and untrusted content. Fast, low latency.
- **AlignmentCheck**: audits the agent's chain of thought for goal hijacking and indirect injection.
- **Regex and custom scanners**: match known signatures in plans, inputs, and outputs.
- **CodeShield**: static analysis on model-generated code before execution.

```python
from llamafirewall import LlamaFirewall, UserMessage, Role, ScannerType

firewall = LlamaFirewall(
    scanners={
        Role.USER: [ScannerType.PROMPT_GUARD],
        Role.ASSISTANT: [ScannerType.AGENT_ALIGNMENT],
    }
)
result = firewall.scan(UserMessage(content=decompiler_output))
# result.decision is ALLOW or BLOCK with a trust score
```

**AgentSeal** (github.com/getagentseal/agentseal) covers the agent-configuration side:

```bash
pip install agentseal
agentseal guard        # scan skills, MCP configs, data flows on this machine
agentseal scan-mcp --server npx @modelcontextprotocol/server-filesystem /tmp
agentseal scan --prompt "$(cat system_prompt.txt)" --model ollama/llama3.1:8b
agentseal shield       # watch config files, quarantine payloads
```

`guard` runs offline with no API key. `scan-mcp` audits live MCP servers for poisoned tool descriptions. `scan` red-teams a system prompt against 225+ adversarial probes and returns a trust score. `shield` watches agent config files for supply-chain changes such as the reported Shai-Hulud MCP-config worm.

## The Two-Agent Pattern

Split reading from judging. The untrusted data flows through a low-privilege reader. A separate verifier with no tool access checks conclusions.

```
┌─────────────┐   tool output    ┌──────────────────┐
│  Binary +   │ ───────────────► │  Reader agent    │
│  MCP tools  │                   │  (untrusted,     │
└─────────────┘                   │   sandboxed,     │
                                  │   read-only)     │
                                  └────────┬─────────┘
                                           │ findings + evidence refs
                                           ▼
                                  ┌──────────────────┐
                                  │  Verifier agent  │
                                  │  (trusted, no    │
                                  │   shell, no      │
                                  │   write tools)   │
                                  └──────────────────┘
```

Rules:

1. **The reader sees the binary.** It gets decompile, strings, xrefs. It runs inside the sandbox with read-only mounts and no egress.
2. **The verifier sees only claims and evidence.** It cannot run tools. It cannot see raw binary text unless the reader quotes it through a sanitizer.
3. **The verifier checks claims against evidence.** Does the cited function actually contain the claimed logic? Does the string at offset X match? Verification gates like this are what the `vmp-reverse-skill` Z3 checks do for symbolic claims.
4. **Neither agent gets write-back tools during hostile sessions.** Comment write-back is a persistent injection channel. Batch reviewed findings and apply them manually after inspection.

This pattern maps to the verification-loop page: the reader proposes, deterministic oracles and the verifier dispose.

## Step-by-Step: A Hardened Session

1. **Prepare the sandbox image.** Install Ghidra 12.2 or newer, radare2, Python, and the MCP servers you need. Pin all versions.
2. **Create the profile.** `docker mcp profile create --name hostile-sample` with only read tools enabled.
3. **Configure egress.** `--network none` for local models, or proxy allowlist for cloud models.
4. **Mount evidence read-only.** `-v evidence:/evidence:ro`. Writable dir only for output.
5. **Run the container.** `docker run --runtime=runsc ...` for unknown samples, Kata or Firecracker for hostile ones.
6. **Start the gateway inside or beside the container.** Connect the agent to the gateway, never directly to MCP servers.
7. **Attach the input firewall.** PromptGuard on all tool output that enters the model context.
8. **Run the session.** Tag every tool result as untrusted data in the system prompt.
9. **Export findings only.** Write the report to the mounted output dir. Destroy the container.
10. **Review write-back manually.** Apply any database comments or renames yourself after checking them.

## Pitfalls

- **Air-gapping does not make the agent safe.** A local model with no egress can still be steered to misclassify the sample or to write poisoned comments into your project. Isolation limits exfiltration, not manipulation.
- **PromptGuard catches direct injection, not semantic reframing.** ALIBI-style attacks live in non-executed sections and rely on narrative, not jailbreak tokens. Keep the verifier in the loop.
- **Comment write-back is persistence.** GhidraMCP's stored-injection issue means a poisoned comment can fire in a later session. Disable write tools or review every write.
- **Read-only mounts protect the binary, not the agent.** The agent's own filesystem still needs the sandbox. A malicious sample cannot write to `/evidence` if mounted `ro`, but it can still attack the agent through tool output.
- **gVisor breaks some workloads.** Exotic syscalls used by packers or anti-debug code may fail under the Sentry. Test the runtime on your toolchain before trusting a session.
- **MCP servers are the weakest link.** A gateway allowlist does nothing if the server itself is malicious. Run third-party MCP servers through mcpjail or in their own containers.
- **Snapshots help forensics, not prevention.** Kata and Firecracker snapshots let you rewind after an incident. They do not stop the first bad action.
- **Do not put production credentials anywhere near the sandbox.** The whole point is that the agent is assumed compromised.

## See Also

- `../07-advanced/ai-security-threats.md` — the full prompt-injection threat model
- `../05-tools/mcp-catalog.md` — Docker MCP Gateway profiles and tool allowlists
- `../07-advanced/ai-security-threats.md` — tool poisoning, rug pulls, and MCP vetting
- `../03-decomp/verification-loop.md` — deterministic oracles for agent claims
- `../05-tools/mcp-catalog.md` — Ghidra MCP server setup and hardening
- `./malware-isolation.md` — CAPEv2, REMnux, and cloud sandboxes
- `../07-advanced/model-selection.md` — running local models for air-gapped sessions
