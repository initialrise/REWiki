# Triage and Function Mapping Before Decompilation

> Tags: triage, capa, floss, yara, ghidra, ida-pro, binary-ninja, mcp, function-mapping | Difficulty: Intermediate | Prerequisites: a sample to analyze, one decompiler bridge (see `../05-tools/mcp-catalog.md`), and a scratch analysis folder

## Overview

Triage answers one question: where should the AI spend its tokens?

A real binary has thousands of functions. An LLM cannot hold a whole binary in context. A measured study found LLMs degrade above about 40 lines of code, and agent reports cite wrong functions half the time. Triage is the deterministic work that fixes both problems.

Triage produces two artifacts before decompilation starts:

1. A triage record. One document per sample. Hashes, format, protections, capabilities, interesting strings, and suspicious imports.
2. A function map. A ranked list of about twenty functions. For each function, the map stores an address, a proposed name, the reason it is interesting, and the evidence.

The map is the input to every later step. Batch decompilation consumes it. Function naming consumes it. The verification loop consumes it.

The pattern is the same one that won across 2026 agent harnesses: deterministic extraction first, agent analysis second, verification gate third. This page covers steps one and two. `../03-decomp/decompile-workflow.md` covers what comes after.

## Setup

### Tool checklist

Install these on the analyst machine, not the target. Most run on Linux. Check the upstream repository for the current release. Do not trust star counts or release numbers from third-party listicles.

| Tool | Purpose | Source |
|---|---|---|
| file, readelf, objdump | Format, headers, imports, sections | binutils, system package |
| strings | Plain ASCII and UTF-16 strings | binutils, system package |
| capa | Capability detection from rules | github.com/mandiant/capa |
| FLOSS | Obfuscated string extraction | github.com/mandiant/flare-floss |
| YARA | Rule matching over files and memory | github.com/VirusTotal/yara |
| Detect It Easy (DIE) | Packer, compiler, protector signatures | github.com/horsicq/DIE-engine |
| pestudio | PE triage GUI with YARA and VirusTotal lookups | pestudio.net, github.com/pestudio/pestudio |
| Ghidra 12.2 or IDA 9.5 or Binary Ninja 6.0 | Decompiler and call graph | see `../05-tools/mcp-catalog.md` |

### Install commands

capa ships as a standalone binary and as a Python package. The rules are a separate repository, `mandiant/capa-rules`. A pip install does not pull the default rules or signature database, so pass them explicitly or use the standalone build.

```bash
# capa as a Python library (needs rules and sigs separately)
pip install flare-capa
wget https://github.com/mandiant/capa-rules/archive/refs/tags/v10.0.0.zip
unzip v10.0.0.zip
capa -r capa-rules-10.0.0/ -s /path/to/capa-sigs suspicious.exe
```

FLOSS installs from PyPI:

```bash
pip install flare-floss
floss malware.exe
```

YARA builds from source or ships in most distributions. The CLI form is:

```bash
yara -r rules/ suspicious.exe        # recursive directory scan
yara -s rules/suspicious.yar suspicious.exe   # show matching strings
```

DIE has a command-line mode plus a GUI. Use the CLI mode inside scripts:

```bash
diec suspicious.exe                  # console output, machine-friendly
diec -d suspicious.exe               # JSON-ish detailed output (check diec -h for flags)
```

pestudio is a Windows GUI tool. There is no official headless mode worth scripting. Use it for interactive PE triage: it computes hashes, parses PE headers, lists imports and strings, runs YARA rules, and queries VirusTotal. Do not feed it on a headless Linux box. For Linux automation, capa plus FLOSS plus YARA cover the same ground.

### The scratch folder

Create one directory per sample before running anything:

```bash
mkdir -p work/sample-001
cd work/sample-001
sha256sum ../../../samples/suspicious.exe | tee sha256.txt
```

Everything the triage produces lands in this folder. Keep the original sample read-only. Copy it into the folder only if the sandbox plan calls for it. See `../01-setup/agent-sandboxing.md`.

## Step-by-Step

### Step 1: Identify the file

Run `file` first. It catches mislabeled samples and reveals packed or concatenated payloads.

```bash
file suspicious.exe
# suspicious.exe: PE32+ executable (GUI) x86-64, for MS Windows, 6 sections
```

Then inspect headers with the right tool for the format:

```bash
# ELF
readelf -h suspicious.bin
readelf -l suspicious.bin          # program headers, entry point
readelf -S suspicious.bin          # sections, look for UPX0/UPX1
readelf -s suspicious.bin | head   # dynamic symbols

# PE
objdump -x suspicious.exe | less   # headers, imports, exports
objdump -p suspicious.exe          # import table only
python3 -c "import pefile" 2>/dev/null || pip install pefile
```

Record in the triage document:

- Architecture: x86, x86-64, ARM, ARM64, MIPS.
- Format: PE, ELF, Mach-O, raw firmware, script.
- Entry point address and section.
- TLS callbacks. On Windows these run before `main` and are a common evasion point.
- Exported functions for DLLs. Exports are free function names. Harvest them.
- Compiler or linker hints: Rich header, `.comment` section, Go build info, Rust panic strings.

For compiler fingerprinting beyond `file`, run DIE:

```bash
diec suspicious.exe > die.txt
```

DIE signatures identify packers (UPX, ASPack, VMProtect, Themida), compilers, and linkers. Its signature database lives in the `DIE-engine` repository under `db/`. A packer hit changes the whole plan: you deobfuscate first, then map. See `../06-topics/deobfuscation.md`.

### Step 2: Harvest strings

Plain strings first:

```bash
strings -a -n 6 suspicious.exe > strings-ascii.txt
strings -a -e l -n 6 suspicious.exe > strings-utf16.txt
strings -a -n 6 -t x suspicious.exe > strings-offsets.txt   # with file offsets
```

The `-t x` variant matters. Every offset is a potential xref target in the decompiler.

Then obfuscated strings with FLOSS:

```bash
floss suspicious.exe > floss.txt
floss --only stack tight suspicious.exe > floss-stack.txt   # stack-constructed strings only
```

FLOSS extracts four string classes that `strings` misses: static, stack, tight, and decoded strings. It also handles Go, Rust, and Swift string formats that plain `strings` mangles. Source: github.com/mandiant/flare-floss, README section "Obfuscated Strings".

Scan the string dumps for:

- URLs, domains, IP addresses, file paths.
- Registry keys, service names, mutex names.
- Format strings that reveal function purpose: `"%s failed: %d"`, `"Usage: %s <file>"`.
- Crypto constants and base64 blobs.
- Error messages. They name subsystems: `"ssl handshake failed"` means TLS code lives nearby.

Feed the interesting strings to the map as search seeds. Each string gets an offset. The decompiler finds xrefs to that offset. The functions that reference the string are candidates.

### Step 3: Run capa for capabilities

capa matches rules against the binary and reports capabilities: "persist via Run registry key", "resolve DNS", "inject into another process".

```bash
capa -j suspicious.exe > capa.json        # JSON for the agent
capa -v suspicious.exe > capa.txt         # all rule matches, nested included
capa -vv suspicious.exe                   # show how each rule matched
```

Default capa output shows only top-level matches. `-v` shows every matched rule including nested ones. `-vv` shows the matching evidence per rule. For triage, start with default output. Drop to `-vv` on a capability that matters.

Tag filtering narrows results:

```bash
capa -t persistence suspicious.exe
capa -t communication suspicious.exe
capa -t anti-analysis suspicious.exe
```

capa also restricts analysis to specific functions once you know them:

```bash
capa --restrict-to-functions 0x4019C0,0x401CD0 suspicious.exe
```

This is useful in the verification loop: re-run capa on one function to check a claim.

Capability hits are leads, not verdicts. A rule says "the binary contains code that resolves DNS". It does not say where. The map step locates the function.

capa runs inside IDA Pro and Ghidra as a plugin too (the capa Explorer). If your decompiler bridge supports it, run capa inside the tool so addresses line up with the database. CLI capa and plugin capa can disagree on addresses for packed binaries.

### Step 4: Run YARA rules

YARA answers "does this look like family X or technique Y". capa answers "what can this do". They overlap but differ. YARA rules encode specific byte patterns and author attributions. capa rules encode general capabilities.

Get rule sets:

- `github.com/mandiant/capa-rules` — capa capability rules, not YARA rules. capa has its own engine. For YARA use dedicated rule repos.
- `github.com/pedramamini/awesome-yara` — curated list of YARA rules, tools, and people.
- `github.com/Yara-Rules/rules` — community YARA rule collection.
- Vendor rules: Malpedia (malpedia.caad.fkie.fraunhofer.de) publishes YARA rules per malware family.

Run:

```bash
yara -r ~/rules/ suspicious.exe > yara-hits.txt
```

Record every hit: rule name, namespace, matching strings via `-s`.

For memory-resident or unpacked analysis, scan the process memory later with `yara` Python bindings or a sandbox. Static YARA on a packed binary finds only the packer stub.

### Step 5: pestudio for PE triage

On Windows, open the sample in pestudio. It produces one screen with:

- Hashes (MD5, SHA-1, SHA-256, ssdeep fuzzy hash).
- PE header details: sections, entry point, subsystem, compiler timestamp.
- Import table grouped by DLL.
- String extraction.
- YARA rule hits.
- VirusTotal verdict count.

pestudio is a GUI tool. There is no supported headless mode. Its value is speed: one screen replaces ten commands. Do the same work manually on Linux with the tools above when the sample cannot leave the analysis VM.

### Step 6: Read the triage record

Write `triage.md` in the sample folder. Template:

```markdown
# Triage: suspicious.exe

- SHA-256: <hash>
- Format: PE32+ x86-64 GUI executable
- Packer: none detected by DIE / UPX detected
- capa top hits: persistence via Run key, resolve DNS, create remote thread
- FLOSS: 43 decoded strings, 2 stack strings
- YARA: hits rule "win_trojan_agent_x" (namespace crimeware)
- VT: 12/70 detections (unverified, check date)

## Suspicious imports
- CreateRemoteThread, WriteProcessMemory, VirtualAllocEx, WinHttpOpen, RegSetValueExW, CryptDecrypt

## Interesting strings (with offsets)
- 0x4A2010 "http://evil.example/beacon.php"
- 0x4A2088 "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run"
- 0x4A2100 "AES-256-CBC key=%s"

## Entry points
- AddressOfEntryPoint: 0x140001000 (section .text)
- TLS callbacks: 1 at 0x140002400
- Exports: none
```

This document feeds the agent's first prompt. Keep it factual. Every claim traces to a tool output in the same folder.

### Step 7: Identify entry points

Decompilers need a starting address. Find all plausible entries, not just one.

Native binaries:

- PE: `AddressOfEntryPoint` from the optional header. This lands on the CRT startup (`mainCRTStartup`, `wWinMainCRTStartup`), not on user code. The real logic is one call deeper. In Ghidra the entry shows as `entry`. In IDA it shows as `start`.
- ELF: `_start` calls `__libc_start_main`, which receives `main` as an argument. The `main` address is loaded into a register before the call.
- DLLs: `DllMain` runs on load. Also check `TLS` directory callbacks, which run before `DllMain`.
- .NET: entry is the managed `Main`. Use ILSpy or dnSpy, not a native decompiler.
- Go: `main.main` is findable through the Go build info and the pclntab. See `../06-topics/` for Go-specific notes.

Script and firmware:

- Shellcode: no entry point metadata. Start at offset 0 or the first call target.
- Firmware blobs: find the vector table. ARM Cortex-M starts at the reset handler address in word 1 of the vector table.

In the decompiler, rename the entry function before mapping. `entry` becomes `crt_startup` or `main_entry`. This makes call-graph output readable.

### Step 8: Import and export analysis

Imports reveal intent. Group the import table by DLL and flag high-signal APIs.

Windows high-signal imports:

| Category | Imports |
|---|---|
| Process injection | `CreateRemoteThread`, `NtCreateThreadEx`, `QueueUserAPC`, `SetThreadContext`, `WriteProcessMemory`, `VirtualAllocEx` |
| Network | `InternetOpen`, `HttpSendRequest`, `WinHttpOpen`, `socket`, `connect`, `send`, `recv`, `getaddrinfo` |
| Crypto | `CryptEncrypt`, `CryptDecrypt`, `BCryptEncrypt`, `CryptAcquireContext` |
| Persistence | `RegSetValueEx`, `CreateService`, `StartService`, `schtasks` |
| Anti-analysis | `IsDebuggerPresent`, `CheckRemoteDebuggerPresent`, `NtQueryInformationProcess`, timing APIs |
| File | `CreateFile`, `WriteFile`, `DeleteFile`, `MoveFile`, `GetTempPath` |
| Dynamic loading | `LoadLibrary`, `GetProcAddress`, `GetModuleHandle` |

For each suspicious import, find its xrefs in the decompiler. Each xref lands inside a function. That function is a candidate.

Exports are free names. A DLL exporting `Install`, `VerifyLicense`, `DecryptPayload` hands you the map.

Delay-load imports and dynamic `GetProcAddress` resolution hide APIs from the static import table. FLOSS and capa catch some of this. For the rest, watch for `LoadLibrary` + `GetProcAddress` pairs in the decompiled candidates.

### Step 9: String xref seeding

Take the interesting strings from Step 2. For each, search the decompiler for the address.

In Ghidra headless or through MCP:

```python
# GhidraScript sketch
for addr in [0x4A2010, 0x4A2088, 0x4A2100]:
    ref = getReferenceManager().getReferencesTo(toAddr(addr))
    for r in ref:
        f = getFunctionContaining(r.getFromAddress())
        print(hex(addr), "->", f.getName(), hex(f.getEntryPoint()))
```

In IDA through the MCP server, the equivalent is a "find xrefs to address" tool. In Binary Ninja, the HLIL or MLIL index gives the same.

Each hit produces a candidate function. Tag the function with the string it references. This is the highest-precision seed you have. A function that references `"http://evil.example/beacon.php"` is a C2 sender, full stop.

### Step 10: Call-graph slicing — pick the next twenty functions

Now combine the seeds into a ranked list. The method:

1. Collect candidate functions from: entry point, suspicious import xrefs, string xrefs, capa-hit addresses.
2. Expand each candidate upward and downward one to two call levels. Callers show how the function is reached. Callees show what it calls.
3. Score each function:
   - +3 for each suspicious import it calls.
   - +2 for each interesting string it references.
   - +2 for being called by an already-selected function.
   - +1 for being in the capa report's function list.
   - −1 for being a known CRT or library function (`malloc`, `printf`, `memcpy`).
4. Keep the top twenty. Break ties by address order for determinism.

This is a simplified version of what Kong does in its triage phase (github.com/amruth-sn/kong): deterministic call-graph ordering before LLM analysis. Kong's published result — reconstructing the XZ backdoor kill chain in about 15 minutes for about $6.63 — shows the pattern works at pipeline scale. You do not need the full pipeline. You need the ordering.

Expansion rules:

- Depth 1 callers only for library functions. Do not walk into `memcpy`.
- Depth 2 callers for user functions. Who calls the C2 sender? The dispatcher.
- Stop at indirect calls through function pointers unless the pointer is resolved.
- Skip functions larger than a threshold (for example 2,000 instructions) in the first pass. Flag them for manual review.

Write the ranked list to `map.md`.

### Step 11: Build the map document

The map is what the agents consume. It must be self-contained. An agent that reads only `map.md` plus `triage.md` should know what to decompile and why.

```markdown
# Function map: suspicious.exe

Sample: sha256 <hash>
Decompiler: Ghidra 12.2 project suspicious.exe.gpr
Generated: 2026-11-05

## Legend
- confidence: confirmed (xref-verified) | likely (heuristic) | guess
- status: pending | named | decompiled | verified

## Priority queue (top 20)

| # | address | current name | proposed name | score | evidence | status |
|---|---------|--------------|---------------|-------|----------|--------|
| 1 | 0x140001A30 | FUN_140001a30 | beacon_send | 9 | refs "beacon.php" str 0x4A2010; calls WinHttpSendRequest | pending |
| 2 | 0x140002110 | FUN_140002110 | reg_persist_run | 7 | refs "CurrentVersion\\Run"; calls RegSetValueExW | pending |
| 3 | 0x140003D00 | FUN_140003d00 | inject_remote | 7 | calls CreateRemoteThread, WriteProcessMemory | pending |
| ... |

## Excluded
- FUN_140004000–FUN_140006000: CRT startup, no suspicious imports
- sub_7FF...: system DLL stubs

## Seed strings
| offset | string | xrefs to |
|--------|--------|----------|
| 0x4A2010 | http://evil.example/beacon.php | FUN_140001a30, FUN_140001b20 |

## Seed imports
| import | xrefs to |
|--------|----------|
| WinHttpSendRequest | FUN_140001a30 |
```

Rules for the map:

- Use addresses, not names, as primary keys. Names change. Addresses do not.
- One function per row. No merged entries.
- Proposed names follow the naming convention in the next section.
- Every row cites its evidence. "calls WinHttpSendRequest" is evidence. "looks suspicious" is not.
- Keep the excluded section. It stops the agent from wasting calls on CRT code.

### Step 12: Naming conventions for unknown functions

Decompiler placeholders differ by tool:

| Tool | Placeholder format | Example |
|---|---|---|
| Ghidra | `FUN_` + address | `FUN_140001a30` |
| IDA | `sub_` + address | `sub_140001A30` |
| Binary Ninja | `sub_` + address | `sub_140001a30` |
| radare2 | `sym.` or `fcn.` + address | `fcn.140001a30` |

Rename in two passes.

Pass 1, deterministic names (before any LLM call):

- Entry point: `crt_startup`, `main_entry`, `dllmain`.
- Functions that only call one import: name after the import. `fcn.WinHttpSendRequest` or `winhttp_send`.
- Functions referenced by one string: name after the string topic. `beacon_send`, `reg_persist`.
- Known library functions: `memcpy`, `malloc`, `__security_check_cookie`.

Pass 2, LLM-proposed names (after decompilation):

- Feed one function at a time. Ask for a name plus a one-line purpose.
- Reject names that only restate the placeholder (`FUN_140001a30` → `sub_140001a30` is a failure).
- Measured accuracy: LLM rename hit 85 percent versus 66 percent for humans on known algorithms, but only 57 percent versus 65 percent overall (NDSS 2026 "Decompiling the Synergy" study). Treat names as hypotheses.
- Record who named what: `deterministic`, `llm-pass1`, `human`. This matters in verification.

Naming rules that survive verification:

- Lowercase snake_case.
- Verb-first for actions: `send_beacon`, `check_debugger`, `decrypt_config`.
- Noun for data helpers: `config_parser`, `string_table`.
- Prefix domain: `net_`, `reg_`, `fs_`, `crypto_`, `inject_`.
- Never encode an address in the final name. `FUN_140001a30` is not a name.

Collision handling: two functions can get the same proposed name. Append the address suffix: `beacon_send_1a30`. Update both the decompiler database and `map.md` in the same pass, or they drift.

### Step 13: The first agent prompt

Once `triage.md` and `map.md` exist, the first agent task is bounded:

```text
Sample: work/sample-001/suspicious.exe (sha256 in triage.md)
Read triage.md and map.md first.
Decompile functions #1 through #5 in the priority queue.
For each function:
1. Report the decompiled pseudocode path.
2. Propose a name and purpose in one line.
3. List every import and string it references.
4. Flag anything that does not match the map's evidence.
Do not analyze functions outside the queue.
Do not speculate about authorship or campaign.
```

This prompt pattern follows the measured guidance: bounded scope, evidence required, no open-ended "find the vulnerability". That prompt shape produced hallucinated buffer overflows in testing and cost 231 percent more wasted time.

## Pitfalls

- Triage on the packed stub. If DIE or capa says UPX/VMProtect/Themida, the import table and strings describe the packer, not the payload. Unpack or dump first. capa on a VMProtect binary mostly sees the VM entry.
- capa pip install without rules. `pip install flare-capa` does not pull capa-rules or signatures. Pass `-r` and `-s` or results are empty.
- Trusting capa hits as verdicts. capa says a capability exists somewhere. It does not give you the function. The xref step does.
- FLOSS on non-Windows binaries. FLOSS targets PE. For ELF use `strings` plus Ghidra's defined strings. FLOSS does handle some formats but PE is the tested path.
- YARA rules from untrusted sources. Rules are code-adjacent: malicious regexes can hang the engine. Pin rule repos. Scan rules in a separate pass before scanning samples.
- Scoring by call-graph degree alone. High-degree functions are often utility functions (`memcpy`, logging). Combine degree with import and string evidence. Degree-only picks CRT code.
- Walking indirect calls naively. Function-pointer calls defeat static call graphs. In Ghidra, unresolved indirect calls appear as `(*code *)` or `(*(code *)*)`. Treat them as leaves unless you have a resolved pointer table.
- Renaming before decompiling. A name like `beacon_send` on wrong pseudocode poisons every later prompt. Name after you have read the function, or mark names as `proposed` until verified.
- One giant map file. If the binary has 10,000 functions, the map holds the top twenty plus the excluded summary. Not all functions.
- pestudio as headless. It is a GUI. Script it with capa/FLOSS/YARA on Linux instead.
- Feeding the LLM raw assembly at triage stage. Feed it `triage.md`, `map.md`, and later decompiler pseudocode. Raw bytes belong to deterministic tools.
- Ignoring TLS callbacks and DllMain. They run before `main` and are favorite hiding spots for anti-debug and early payload staging.
- Forgetting delay-load and `GetProcAddress`. Static import tables under-report API usage on modern binaries.

## See Also

- `../05-tools/mcp-catalog.md` — MCP server setup for Ghidra, IDA, Binary Ninja
- `../03-decomp/decompile-workflow.md` — the per-function decompile loop this map feeds
- `../03-decomp/batch-decompilation.md` — batch export and prompt patterns over the map
- `../03-decomp/verification-loop.md` — deterministic checks on every LLM claim
- `../02-collab/context-engineering.md` — keeping triage facts alive across compaction
- `../09-ops/notes-and-evidence.md` — recording which tool produced which claim
- `../06-topics/deobfuscation.md` — what to do when triage finds a packer
- `../01-setup/agent-sandboxing.md` — where to run the tools on untrusted samples
