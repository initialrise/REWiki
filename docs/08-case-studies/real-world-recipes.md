# End-to-End Recipes: Real RE Scenarios

> Tags: recipes, case-studies, workflow | Difficulty: intermediate | Prerequisites: [agent harness](../02-collab/claude-code-setup.md), [MCP bridge](../05-tools/mcp-catalog.md), [verification loop](../03-decomp/verification-loop.md)

## Overview

This page gives six concrete recipes. Each recipe covers one real reverse-engineering scenario. For each scenario the page lists the tools, a prompt sketch for the agent, a verification step, and a time and cost estimate.

All time and cost figures are estimates. They come from published benchmarks and case studies. They are not measured runs. Treat them as planning numbers only.

The recipes:

| # | Scenario | Primary engine | Hard part |
|---|---|---|---|
| A | Name every function in a stripped 5MB PE | IDA Pro 9.5 or Ghidra 12.2 + agent | Context budget and hallucinated names |
| B | Unpack a VMProtected DLL and recover the payload | x64dbg + Frida + devirtualization tools | VM handler recovery is research-grade |
| C | Rebuild a proprietary protocol from a PCAP | Substrat or Netzob + LLM | Field semantics need live targets or samples |
| D | Port a dead console game via recompilation | N64Recomp or PSXRecomp + compiler-in-loop diff | Toolchain fidelity, not AI |
| E | Triage a suspicious APK | jadx + apktool + Frida MCP | Prompt injection from app strings |
| F | Recover a license check in a .NET app | ILSpy + agent | The check is often weak crypto, not magic |

The evidence base for the estimates:

- Kong reconstructed the CVE-2024-3094 XZ backdoor kill chain from stripped `liblzma` in about 15 minutes for about $6.63. That was a targeted question over a well-understood library.
- DecBench measured about $1.0 to $1.2 per function for gpt-6-astra agent runs, and about $6.6 for claude-opus-4-8.
- SRE-Bench measured $0.50 to $42.5 per instance depending on model and safeguards.
- MalwareBench put the best model at 7.6 percent best@3 on real obfuscated malware across PE, ELF, Mach-O, and APK. Plan accordingly for recipe E.
- Retrobench measured byte-match recompilation of MIPS assembly at about 75 to 98 percent mean byte-match for frontier models, with run-to-run variance in the low double digits.

## Setup

The same setup applies to every recipe. Do it once.

1. Install an agent harness. Claude Code or Codex CLI are the default choices. Kimi Code, Gemini CLI, and Goose also work.
2. Install one MCP bridge for your analysis engine:
   - IDA 9.4 or later: `uvx ida-hcli mcp install` (official Hex-Rays server, code mode).
   - Ghidra: `uvx --from git+https://github.com/bethington/ghidra-mcp ghidra-mcp` or the simpler LaurieWired/GhidraMCP server.
   - Binary Ninja 6.0: the native MCP server ships in the product at `http://127.0.0.1:24642/mcp`.
3. Install a skill pack for your domain. `npx skills add zhaoxuya520/reverse-skill` covers routing for APK, .NET, IDA, radare2, and Binary Ninja.
4. Run every recipe inside a container or VM for untrusted targets. See the isolation notes in #pitfalls and the security page of this wiki.
5. Set a deterministic verification step before you start. Every recipe below names one.

Model guidance for 2026:

| Task shape | Suggested model | Reason |
|---|---|---|
| Interactive bounded tasks | Claude Opus 4.8 or GPT-6 class | Best verified RE capability. Avoid Opus 5.5 for RE. Its safety classifier reportedly halts RE requests since about October 2026. |
| Batch function naming | DeepSeek V4.1 Flash or GLM-5.3 | Cheapest capable loop. SRE-Bench measured DeepSeek V4.1 Flash at $0.50 per instance. |
| Private or hostile binaries | Kimi K3, DeepSeek V4 Pro, GLM-5.3 (1M context, no refusal classifier) | Whole-Ghidra-export context fits. Weaker models are more injectable. Keep the sandbox strict. |
| Air-gapped | Qwen3-Coder-Next via Ollama or vLLM | Best local code model. Expect weaker results on obfuscated code. |

## Recipe A: Name Every Function in a Stripped 5MB PE

### Goal

Assign meaningful names and prototype comments to every function in a stripped PE executable of about 5MB.

### Why this works

Function naming is the bounded task where AI helps most consistently. The NDSS 2026 study measured LLM rename accuracy at 85 percent versus 66 percent for humans on known algorithms. On harder corpora the numbers converge, so names are plausible, not verified.

### Tools

| Tool | Role |
|---|---|
| IDA Pro 9.5 + Hex-Rays ida-mcp | Decompile, rename, retype through the agent |
| Ghidra 12.2 + bethington/ghidra-mcp | Alternative engine. 219 tools including batch operations |
| A headless batch driver | `idalib-mcp`, PyGhidra headless, or `ghidra-cli` (akiselev/ghidra-cli) for JSON output |
| reverify or re-ground | Deterministic check of each claimed name against call sites |

### Procedure

1. Run full auto-analysis in the engine first. Do not let the agent analyze from scratch.
2. Export the function list with addresses, sizes, and caller counts. A 5MB stripped PE typically holds several thousand functions.
3. Chunk the work. One agent call per function or per small cluster. Map-reduce over callees before callers.
4. For each function, ask for a bounded output: proposed name, prototype signature, one-line behavior note, confidence flag.
5. Apply names through the MCP write tools, or write an IDC/Python script that applies a names file.
6. Run the verification pass.

Prompt sketch:

```text
Function FUN_00412ab0 at 0x00412ab0, size 0x340 bytes, 14 call sites.
Here is the decompiled pseudocode:
<paste pseudocode>

Return JSON only:
{"name": "snake_case_name",
 "prototype": "ret_type name(arg_types)",
 "behavior": "one sentence",
 "confidence": "high|medium|low",
 "evidence": ["string X at 0x...", "call to import Y"]}
```

Batch variant for map-reduce:

```text
Summarize every callee of FUN_00412ab0 in one line each.
Then name FUN_00412ab0 based on how it uses those callees.
Cite the callee names as evidence.
```

### Verification

- Compile-free check: re-run the decompiler on renamed functions and confirm the names do not contradict the pseudocode.
- Deterministic check: run reverify (github.com/2akouwu/reverify) or re-ground (github.com/shouvikkkk/re-ground) over the names file. It re-derives claims against the binary and returns VERIFIED, REFUTED, or INCONCLUSIVE.
- Human gate: spot-check the 50 highest fan-in functions by hand. Fan-in names propagate errors.
- Rule: names are comments. Never let a generated name become load-bearing in a later automated step without review.

### Time and cost estimate (estimate)

| Scope | Estimate |
|---|---|
| 5MB PE, about 5,000 to 15,000 functions | 1 to 3 days wall-clock with batching, mostly waiting on rate limits |
| Cost | $20 to $200 depending on model and retry rate. DecBench measured about $1 to $6.6 per function for frontier agents. Batching and cheaper models cut this sharply. |
| First pass quality | Roughly 60 to 85 percent plausible names. Expect a human review pass on the top fan-in set. |

## Recipe B: Unpack a VMProtected DLL and Recover the Payload

### Goal

Extract the original protected code or a readable equivalent from a VMProtect 3.x protected x64 DLL.

### Honest assessment first

VMProtect devirtualization is research-grade. No tool in 2026 reliably devirtualizes arbitrary VMP 3.x binaries unattended. The report classifies Mergen, PUSHAN, and vmp-reverse-skill as active but research-grade. JonathanSalwan/VMProtect-devirtualization is stale but canonical. Plan for days of work, not hours.

The realistic AI-assisted path has two stages:

1. **Unpack**: recover the real PE sections and the OEP from memory.
2. **Devirtualize or lift**: recover handler semantics for the protected functions you actually need.

### Tools

| Tool | Role |
|---|---|
| CAPEv2 sandbox (github.com/kevoreilly/CAPEv2) | Automated unpacking attempts and dump collection. YARA config extraction. REST API |
| x64dbg + duty1g/x64dbg-mcp-server | Breakpoint tracing, OEP hunting, dump verification |
| wul7chaos/vmp-reverse-skill | ptrace trace capture, handler slicing, Ghidra P-code IR, LLM claims verified by Z3. Linux x86-64/ARM64 |
| NaC-L/Mergen | Assembly to LLVM IR lifter. Symbolic execution through VMProtect 3.4 to 3.8.1 and Themida |
| NoAddr/yaps | Open PUSHAN-style rebuild. SLEIGH p-code. Windows-only |
| chramiq/de4vmp | Only if the target is .NET VMProtect |
| Ghidra 12.2 + MCP | Analyze the dumped payload |

### Procedure

1. Run the DLL in CAPEv2 first. Check whether it unpacks itself on load or needs a license-valid path.
2. If CAPE fails, do manual OEP hunting in x64dbg: hardware breakpoint on the section transition, or the ESP trick at the last `push` before the jump to the OEP. Dump with Scylla or equivalent.
3. Verify the dump: imports resolved, sections readable, entry point sane. A bad dump wastes the next stage.
4. For each protected function, pick one of two routes:
   - **Trace route** (vmp-reverse-skill): capture a ptrace trace of the function, slice the VM handlers, lift to P-code, let the LLM name handlers and reconstruct the operation. Every LLM claim goes through a Z3 check that returns PROVEN, REFUTED, FUZZED, or UNVERIFIED.
   - **Lifter route** (Mergen): lift the assembly to LLVM IR, then symbolic-execute through the VM dispatch.
5. Feed only the lifted pseudocode to the agent. Never feed raw VMP handler soup.

Prompt sketch for the trace route:

```text
Here is the lifted P-code for VM handler block H_07 at 0x....
The trace shows it reads vreg[3], XORs with imm 0x9e3779b9, writes vreg[7].
Propose the high-level operation this handler implements.
Return: {"op": "...", "inputs": [...], "outputs": [...],
         "z3_check": "predicate the solver must prove"}
```

### Verification

- The Z3 gate inside vmp-reverse-skill is the model. Every reconstructed claim needs a solver verdict.
- Differential test: run the original protected function and your reconstructed function on identical inputs. Compare outputs and memory writes.
- If the goal is only the payload (not the VM internals), verify by loading the dumped PE and checking that the protected routine produces the same network traffic, file writes, or return values as the original.

### Time and cost estimate (estimate)

| Scope | Estimate |
|---|---|
| Unpack only (OEP + dump) | Hours to 1 day. $5 to $30 of agent time. |
| Devirtualize one protected function | Days. Reported academic results exist but no production-ready pipeline. Budget $50 to $300 and expect partial recovery. |
| Full DLL devirtualization | Not realistic in 2026 for arbitrary VMP 3.x. Target the functions you need. |

## Recipe C: Rebuild a Proprietary Protocol from a PCAP

### Goal

Recover the message structure of a proprietary binary protocol from a packet capture, then produce a Wireshark dissector or a parser.

### Key finding from the research

The honest result in this space: deterministic front-ends do the structure work. LLMs add narrative value. LLMs add no measurable gain on structure inference. Moosa-Salehi/protocol_reverse_engineering reports that its optional LLM stages are evidence-gated and found no measurable gain. Substrat is a deterministic Rust pcap-to-grammar learner that ships an MCP server. Design the pipeline so the LLM interprets, not invents.

### Tools

| Tool | Role |
|---|---|
| tshark / Wireshark | Stream extraction, statistics, conversation endpoints |
| Substrat (nicolashedoire.github.io/substrat-landing) | Deterministic pcap-to-grammar learner with MCP server |
| Netzob (github.com/netzob/netzob) | PRE toolkit: inference, FSM inference, fuzzing, dissector export |
| Moosa-Salehi/protocol_reverse_engineering | PCAP to message-type discovery to field boundaries to Lua export |
| wireshark-mcp (github.com/andsopwn/wireshark-mcp) | Bounded LLM summaries over capture metadata |
| 010-editor-mcp or Kaitai Struct | Binary format templates and .ksy spec generation |
| A live target or more captures | Needed for field semantics. Static PCAP alone rarely yields them. |

### Procedure

1. Extract TCP or UDP streams. `tshark -r capture.pcap -q -z conv,tcp` to find the interesting endpoints first.
2. Filter to one conversation. Binary protocols die in mixed captures.
3. Run Substrat or Netzob to cluster messages and infer field boundaries. These tools align messages by length and position entropy.
4. Hand the clustered message table to the agent. Ask for interpretation: which fields look like lengths, opcodes, checksums, session tokens.
5. Generate a Wireshark Lua dissector or a Kaitai .ksy spec from the inferred grammar.
6. Verify against held-out packets.

Prompt sketch:

```text
These 40 aligned messages were clustered by Substrat.
Column offsets are byte positions. Values shown in hex.
<message table>

Hypothesize the role of each field: length, opcode, sequence,
checksum, or payload. For each claim cite the byte positions
and values that support it. Mark anything you cannot support
as "unknown".
```

### Verification

- Re-parse every packet in the capture with the generated dissector. Count parse failures. A correct grammar parses 100 percent of well-formed messages.
- Checksum test: if you claim a field is a checksum, recompute it over the claimed coverage for all messages. It must match.
- Length test: if you claim a length field, the value must equal the remaining message size for every message.
- Live test when possible: replay or generate a message and confirm the real client or server accepts it.

### Time and cost estimate (estimate)

| Scope | Estimate |
|---|---|
| Simple length-prefixed protocol, hundreds of messages | Half a day to 2 days. $10 to $60. |
| Encrypted or obfuscated protocol | Add key recovery or semantic inference. Days to weeks. LLM help is marginal here. |
| Field semantics | Cannot be estimated from PCAP alone. Needs a live target, source, or more context. |

## Recipe D: Port a Dead Console Game via Recompilation

### Goal

Produce a native PC port of a console game, either as a static recompilation (fast, approximate) or a matching decompilation (slow, byte-exact).

### Two different goals

The 2026 console community uses two workflows. Do not mix them.

- **Static recompilation**: translate the whole ROM to C once. N64Recomp, PSXRecomp, PS2Recomp, nxrecomp. Goal is a playable port, not byte-match.
- **Matching decompilation**: recover source that compiles to identical bytes. decomp.me, objdiff, per-project repos. Goal is maintainable source.

### Tools

| Tool | Role |
|---|---|
| N64Recomp (github.com/N64Recomp/N64Recomp) | Static MIPS-to-C recompiler for N64. Active, about 8.3k stars |
| PSXRecomp (github.com/RetroPortingToolKit/psxrecomp) | PlayStation 1 static recomp |
| PS2Recomp (github.com/ran-j/PS2Recomp) | PlayStation 2 static recomp |
| decomp.me (github.com/decompme/decomp.me) | Collaborative matching platform. REST API for agent submission |
| objdiff (github.com/encounter/objdiff) | Byte-diff scoring engine |
| rebrew (github.com/maci0/rebrew) | Compiler-in-loop matching workbench with agent workflows |
| asm-differ (github.com/simonlindholm/asm-differ) | objdump diff for quick checks |
| The original compiler toolchain | IDO for N64, MWCC for GameCube, setup-msvc for PC targets. Fidelity lives here. |

### Procedure for matching decomp

1. Pick functions small enough to finish. One function at a time. The Retrobench harness showed frontier models reach about 75 to 98 percent mean byte-match on MIPS-to-C with the original IDO compiler.
2. Give the agent the disassembly and the compiler version. Ask for C, not pseudocode.
3. Compile with the original compiler flags. Diff with objdiff or asm-differ.
4. Feed the diff back. "Your `addiu` became a `lw` plus `addiu`. The original kept the pointer in `$a1`. Adjust."
5. Iterate until byte-match or until you hit the function's complexity ceiling.

Prompt sketch:

```text
Target: MIPS R4300, IDO 7.1, -O2.
Original assembly:
<assembly>

Write C that compiles to these exact bytes. Constraints:
- Only ISO C plus the target's intrinsics.
- Match register allocation where visible.
- If you cannot match, explain which instruction diverges
  and propose the closest alternative.
```

### Procedure for static recomp

1. Run the project's recompiler on the ROM. N64Recomp and PSXRecomp produce a C project.
2. Use the agent for glue work: fixing compiler errors in generated C, mapping hardware registers, writing the audio and input shims. This is where AI helps most in recomp projects.
3. Use a deterministic oracle. The Tomba! PS1 recomp case study (1379.tech) used Claude Opus plus Ghidra plus PCSX-Redux and validated against attract-demo determinism.
4. Compare frames or memory against the emulator reference at fixed input sequences.

### Verification

- Matching decomp: objdiff score of 100 percent, or the function's bytes identical.
- Static recomp: frame-exact or memory-exact comparison against the reference emulator on a scripted input sequence. Attract-mode determinism is the cheap oracle.
- Never accept "it compiles" as verification. Generated C that compiles can still crash on the first frame.

### Time and cost estimate (estimate)

| Scope | Estimate |
|---|---|
| Static recomp of a supported game | Days to weeks of glue work. AI cuts the mechanical parts. Cost $50 to $500 depending on how broken the generated C is. |
| Matching decomp, one function | Minutes to an hour per function with agent iteration. Retrobench budgets were 25 builds per function. |
| Matching decomp, whole game | Person-years for humans. AI-assisted projects like n64hub (about 25 AI-written N64 recomps, October-November 2026) show partial progress. |
| Note | Zelda64Recomp bans GenAI contributions. Check project policy before submitting agent-written code. |

## Recipe E: Triage a Suspicious APK

### Goal

Classify an APK as benign or malicious and produce an evidence-backed report: permissions, suspicious APIs, network indicators, packers, and a recommended dynamic follow-up.

### Honest assessment first

Real malware RE is far from solved. MalwareBench measured the best model at 7.6 percent best@3 on real obfuscated samples. Refusals hit 10 to 26 percent of rollouts. Treat the agent as a triage assistant that organizes evidence. Do not treat it as an analyst that reaches verdicts. Project Ire measured 89 percent precision but 26 percent recall. That makes it a filter, not a verdict.

### Tools

| Tool | Role |
|---|---|
| jadx + jadx-mcp-server (zinja-coder) or jadx-headless-mcp | DEX to Java decompile. 34 tools or 26 tools depending on server |
| apktool-mcp-server | decode/build/smali edit for resources and native smali |
| APKLab (github.com/APKLab/APKLab) | VS Code workbench. apktool plus jadx plus smali-lsp |
| capa | Capability detection on the native libraries |
| MobSF or a cloud sandbox (ANY.RUN, Joe Sandbox) | Dynamic behavior report |
| Frida + kahlo-mcp or frida-c2-mcp | Targeted dynamic hooks after static triage |
| VirusTotal / CAPE | YARA and config extraction |

### Procedure

1. Static pass first, always. `apktool d` for resources and manifest, jadx for code.
2. Extract the manifest permissions and the declared components. Flag dangerous permissions against the app's stated purpose.
3. Feed the agent the jadx output tree plus the manifest. Ask for bounded questions: "list every use of `DexClassLoader`, `Runtime.exec`, `sendTextMessage`, or reflection into `Class.forName`".
4. Check for packers. If classes are stub loaders, switch to the unpacking pipeline (Exuvia or MobileRE-Skill) before deeper analysis.
5. Run the APK in a sandbox. Compare sandbox IOCs against what static analysis predicted.
6. Write the report with evidence links: file, class, method, offset.

Prompt sketch:

```text
APK triage, stage 1: static only.
Manifest permissions: <list>
Entry points: <activities, services, receivers>

Answer only these questions, each with file:line evidence:
1. Does any code load dynamic Dex or call DexClassLoader?
2. Does any code execute shell commands?
3. Does any code send SMS or read the contact list?
4. Are there hardcoded URLs, IPs, or keys?
5. Is there a packer stub? Which class?

Do not speculate beyond the evidence. Mark unknowns "unknown".
```

### Verification

- Every claim in the report needs a `file:line` citation. Re-open the cited location and confirm.
- Cross-check static findings against the sandbox report. Static-only claims about network behavior are unverified until observed.
- For a "malicious" verdict, require at least one dynamic observation: a suspicious network destination, a dropped file, or a privilege escalation attempt.
- For a "benign" verdict, state the coverage limits. Absence of evidence in jadx output is not evidence of absence, especially under packers or heavy obfuscation.

### Time and cost estimate (estimate)

| Scope | Estimate |
|---|---|
| Routine triage of one APK | 1 to 4 hours. $5 to $30. |
| Packed or heavily obfuscated sample | Add unpacking and dynamic stages. Half a day to several days. |
| Verdict confidence | Expect useful organization of evidence, not reliable verdicts. Human review is mandatory for any actionable conclusion. |

## Recipe F: Recover a License Check in a .NET App

### Goal

Find and explain the license validation logic in a .NET application, typically to understand it, patch it for interoperability, or assess its strength.

### Why this is the easiest recipe

Managed code decompiles to near-source output. ILSpy produces readable C# that an LLM can reason over directly. This is the highest-success-rate scenario in the report.

### Tools

| Tool | Role |
|---|---|
| ilspycmd (github.com/icsharpcode/ILSpy) | `ilspycmd -p -o outdir target.dll` produces a full source tree. CLI is ideal for piping to an agent |
| dnSpyEx (github.com/dnSpyEx-Project/dnSpy) | GUI debugging plus edit plus decompile. Windows or Wine |
| dnlib (github.com/0xd4d/dnlib) | Read/write .NET metadata for patching or inspection scripts |
| de4dot or equivalent | Deobfuscation if the assembly is obfuscated before analysis |
| A .NET disassembler for IL-level checks | ilspycmd alone can miss IL tricks. Check with a second tool when the C# looks too clean. |

### Procedure

1. Decompile the whole assembly: `ilspycmd -p -o src/ target.dll`.
2. Search the source tree for license-shaped terms: `license`, `serial`, `activation`, `trial`, `Validate`, `Check`, `RSA`, `AES`, machine fingerprint fields.
3. Feed the candidate methods to the agent one at a time. Ask it to reconstruct the algorithm.
4. If the code is obfuscated, run a deobfuscator first. Names like `A.a()` are normal in obfuscated assemblies.
5. For verification, build a small harness that calls the validation method with test inputs.

Prompt sketch:

```text
Here is the decompiled C# for method LicenseValidator.Check(string key).
Reconstruct the validation algorithm step by step:
- What transformations apply to the input key?
- What is compared, and against what?
- Where does the expected value come from (embedded resource,
  registry, network, computed)?
- What does a valid key look like structurally?

Return pseudocode plus the exact C# lines that support each step.
```

### Verification

- Deterministic: write a C# test harness that references the original assembly and calls the method. Feed it keys the agent claims are valid and invalid. Compare against expected outcomes.
- For patched builds: confirm the patched assembly loads and the app runs. A patch that compiles can still fail at runtime due to strong-name or signature checks.
- If the license check calls home, verify the network endpoint independently. Do not trust the agent's description of the protocol.

### Time and cost estimate (estimate)

| Scope | Estimate |
|---|---|
| Unobfuscated .NET app | Hours. $5 to $30. Highest-confidence recipe in this page. |
| Obfuscated .NET app | Add deobfuscation time. Half a day to a few days. |
| Strong-name or VMProtect-on-.NET target | Escalates to recipe B territory. chramiq/de4vmp exists for .NET VMProtect but is research-grade. |

## Pitfalls

These apply to every recipe.

### General

- **Hallucinated citations.** Half of cited functions in agent RE reports were wrong in one measured study. Every claim needs a re-checkable pointer: address, offset, or file line.
- **Greedy fetching.** Agents retrieve broadly and saturate context on real binaries. Keep evidence outside compacted context. Use a ledger that survives compaction.
- **Open-ended prompts.** "Find the vulnerability" produced hallucinated answers and cost 231 percent more wasted time in a controlled study. Ask bounded questions.
- **Raw assembly input.** Feed decompiler pseudocode to the model, not assembly. Exception: matching-decomp recipes where the assembly is the spec.
- **Memorized targets.** Public crackmes and CTF binaries are in training data. Generated or private corpora discriminate better. Do not trust a solve on a famous sample.

### Per-recipe

- **Recipe A**: fan-in names propagate errors. Review the top 50 by hand. Names are comments, not ground truth.
- **Recipe B**: a bad memory dump invalidates everything downstream. Verify the dump before devirtualization. CAPE unpacking is not guaranteed.
- **Recipe C**: PCAP alone rarely yields field semantics. Do not let the agent invent meanings for unknown fields. Mark them "unknown".
- **Recipe D**: check project GenAI policy before submitting. Zelda64Recomp bans GenAI contributions. Compiles-clean is not correct.
- **Recipe E**: app strings are an injection channel. Read-only MCP mode, no write-back tools, sandboxed execution. See arXiv 2605.30667 and the CAIRN A3 report for documented cases.
- **Recipe F**: a clean C# decompile can hide IL-level tricks. Cross-check suspicious methods at IL level. Strong-name signatures break naive patches.

### Security baseline for all recipes

1. Run the agent and MCP servers inside Docker, gVisor, or a VM. No production credentials. Egress allowlist.
2. Treat every tool output as untrusted data. Provenance-tag it. Never let decompiled text authorize tool calls.
3. Use read-only MCP modes during untrusted-binary sessions. Persistent comment injection through write-back is documented (GhidraMCP issues #140 and #141).
4. Prefer local models for hostile samples. Weaker local models are more injectable. The sandbox must be strict.
5. Update Ghidra. GHSA-mc3p-mq2p-xw6v (Mach-O `{@execute}` RCE) is fixed in Ghidra 12.0.3+.
6. Vet MCP servers. Tool poisoning and rug pulls are documented. Use AgentSeal, mcp-fence, or Docker MCP Gateway.

## See Also

- [Agent harnesses](../02-collab/claude-code-setup.md) — Claude Code, Codex, dedicated RE harnesses
- [MCP servers](../05-tools/mcp-catalog.md) — IDA, Ghidra, Binary Ninja, debugger bridges
- [The verification loop](../03-decomp/verification-loop.md) — deterministic checks that decide
- [Function naming and type recovery](../03-decomp/decompile-workflow.md) — deeper dive on recipe A
- [VMProtect and Themida](../06-topics/deobfuscation.md) — devirtualization tool landscape
- [Protocol and format RE](../06-topics/protocol-reverse.md) — grammar inference and dissector export
- [Matching decompilation](../04-recomp/matching-decomp.md) — byte-exact game RE workflow
- [Android RE](../06-topics/mobile-android-re.md) — APK pipeline and unpacking
- [Managed code RE](../06-topics/managed-code-re.md) — .NET, Java, Go, Rust decompilation
- [Malware triage](../06-topics/malware-analysis.md) — sandboxed analysis patterns
- [Isolation and prompt injection](../07-advanced/ai-security-threats.md) — threat model for agentic RE
- [Model selection](../07-advanced/model-selection.md) — measured capability numbers behind the estimates
