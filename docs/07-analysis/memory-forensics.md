# Memory Forensics and Dump Analysis

> Tags: memory-forensics, volatility3, volatility, dump-analysis, yara, injected-code, malware-triage, hibernation, procdump | Difficulty: Intermediate | Prerequisites: `../06-topics/malware-analysis.md`, `../04-dynamic/unpacking-dumping.md`

## Overview

Volatile memory is the ground truth. A process that hides itself on disk can leave its injected code, its network buffers, its decrypted strings, and its in-memory payload sitting in RAM. Memory forensics reads that RAM after the fact. You take a dump. You run Volatility 3 against it. You answer questions like: which processes injected code, which DLLs are not backed by a file, which userland implant ran from `svchost.exe`, and which mutex or C2 string survived unpacking.

The 2026 stack:

- Acquisition tools: WinPmem (Windows), LiME (Linux/macOS), procdump (process dumps), hibernation and crash files (Windows), `dump-memory` on macOS through LiME.
- Analysis framework: Volatility 3 (`github.com/volatilityfoundation/volatility3`). The only supported version. Volatility 2 is deprecated.
- Injection detection: Volatility plugins `malfind`, `hollowfind`, `vadinfo`, `malware.peb_lookup`, plus YARA rules run over process memory.
- AI assists: writing Volatility plugins, turning JSON output into reports, drafting YARA rules from sample strings, summarizing suspicious VAD regions.

This page covers the full pipeline: acquire, analyze, hunt injected code, verify, report. For the static side of the same target see [`../06-topics/malware-analysis.md`](../06-topics/malware-analysis.md). For dumping a running unpacker see [`../04-dynamic/unpacking-dumping.md`](../04-dynamic/unpacking-dumping.md).

## Setup

### Install Volatility 3

Volatility 3 is a Python framework. Install from PyPI or clone for development. The docs say Python 3.8.0 or later is required. A virtual environment is recommended because the symbol-table cache is large.

```bash
# PyPI install
pip install volatility3
vol -h

# Development install (recommended for plugin work)
git clone https://github.com/volatilityfoundation/volatility3.git
cd volatility3/
python3 -m venv venv && . venv/bin/activate
pip install -e ".[dev]"
```

Symbol tables. Volatility 3 needs per-OS symbol tables (PDB/DWARF derived). The repo publishes zips: `windows.zip`, `mac.zip`, `linux.zip`. Download them and place them in the `symbols` directory next to the `vol` executable, or let Windows symbols auto-download on first use.

```bash
# Symbol packs at https://github.com/volatilityfoundation/volatility3/tree/develop/volatility3/symbols
# Verify hashes against SHA256SUMS in the same directory.
mkdir -p volatility3/symbols
unzip windows.zip -d volatility3/symbols
# First run rebuilds the cache. It can take a long time once.
vol -f sample.raw windows.info
```

Key flags:

| Flag | Meaning |
|---|---|
| `-f` / `--single-location` | Path to the memory image or device |
| `-s` / `--symbols` | Override the symbols directory |
| `--single-location` | Required for most plugins |
| `--physical-offset` | Offset for raw images inside a larger file |
| `windows` / `linux` / `mac` | OS plugin namespace |

A basic triage command set for a Windows image:

```bash
vol -f memory.raw windows.info
vol -f memory.raw windows.pslist
vol -f memory.raw windows.psscan          # finds unlinked processes
vol -f memory.raw windows.malfind
vol -f memory.raw windows.hollowfind
vol -f memory.raw windows.dlldump --pid <PID> --dump
dlls --pid <PID>
```

### Install acquisition tools

Windows acquisition (needs admin, runs on the live host or a WinPE environment):

```powershell
# WinPmem (Velocidex). Signed binaries for Win7-Win10 per the repo README.
# Download winpmem_mini_x64.exe from github.com/Velocidex/WinPmem/releases
winpmem_mini_x64.exe C:\cases\mem.raw          # raw image
winpmem_mini_x64.exe -1 C:\cases\mem.raw       # force MmMapIoSpace method
```

WinPmem writes a raw image. It supports read-only by default. Write support exists in source but signed binaries ship with it disabled. The driver reads physical memory through three independent methods, so at least one should work under a rootkit. See the [WinPmem repo](https://github.com/Velocidex/WinPmem).

Linux acquisition (LiME, `github.com/504ensicsLabs/LiME`):

```bash
# Compile on the target or build elsewhere and load the .ko
make
insmod lime-$(uname -r).ko "path=/cases/mem.lime format=lime"
# format=raw for a flat image, format=lime for LiME format (metadata-aware)
```

macOS: LiME also supports macOS with `osx` builds. `livedump` (`github.com/volatilityfoundation/dump-memory`) is an alternative for macOS. Verify against the target's macOS version.

Process-only dumps (not full memory, but fast):

```powershell
# Sysinternals procdump — dumps one process, can trigger on exception
procdump64.exe -ma <PID> C:\cases\proc.dmp
procdump64.exe -ma -n 3 svchost.exe C:\cases\svchost.dmp
```

A `.dmp` file is a minidump or full dump. Volatility can read it with `-f` and the right layer. Windows crash dumps (`MEMORY.DMP`, `minidump`) use the same path.

Hibernation file: `C:\hiberfil.sys`. It is a compressed hibernation image. Convert before analysis:

```bash
# On Linux, use the volatility plugin or a converter:
vol -f hiberfil.sys windows.info
# Or use the hibernation analysis tool: volatilityfoundation has hibernation support in Volatility 3.
```

The hibernation file is a partial memory image. It captures kernel and user state at hibernate time. It is useful when you cannot run an acquisition tool.

## Step-by-Step

### Step 1: Acquire the image

Pick the acquisition method by environment:

| Scenario | Tool | Output |
|---|---|---|
| Live Windows host, admin access | WinPmem | `mem.raw` |
| Live Linux host, root | LiME | `mem.lime` or `mem.raw` |
| macOS | LiME or livedump | `mem.lime` |
| Suspicious single process | procdump | `proc.dmp` |
| No live access, hibernated machine | `hiberfil.sys` | Compressed image, partial |
| Sandbox detonation | CAPEv2 or any.run | Dump captured during run |

Always record:

- The acquisition timestamp.
- The tool version and command line.
- The host OS and build.
- The image hash (SHA-256).

### Step 2: Identify the image format

```bash
file memory.raw
# Or use the volatility image info:
vol -f memory.raw windows.info
```

Volatility auto-detects the format for raw, LiME, crash dump, and hibernation. If it fails, you may need `--physical-offset` or a manual layer.

### Step 3: Build the process list

Start with `pslist` then `psscan`. `pslist` walks the active process list. `psscan` scans physical memory for `EPROCESS` structures and finds terminated or hidden processes.

```bash
vol -f memory.raw windows.pslist > pslist.txt
vol -f memory.raw windows.psscan > psscan.txt
```

Diff the two. A PID in `psscan` but not `pslist` is a candidate hidden process. Compare creation times, parent PIDs, and image paths.

### Step 4: Hunt injected code

This is the core of the page. Three Volatility plugins cover most cases.

`malfind` scans each process's VAD (Virtual Address Descriptor) tree for memory regions that look like injected code:

```bash
vol -f memory.raw windows.malfind > malfind.txt
```

Output columns: PID, process name, VAD address, protection, tag, hex dump preview. A `PAGE_EXECUTE_READWRITE` region with `MZ` or `PE` header inside a normal process is suspicious. The tag column shows what the scanner matched.

`hollowfind` looks specifically for process hollowing. It compares the memory image in a process against the file on disk. If the in-memory PE header differs from the disk image, the process was likely hollowed.

```bash
vol -f memory.raw windows.hollowfind > hollowfind.txt
```

`vadinfo` dumps the full VAD tree for a PID. Use it when `malfind` misses something.

```bash
vol -f memory.raw windows.vadinfo --pid 1234 > vadinfo.txt
```

Manual VAD review. The VAD tree shows every committed region. Look for:

- Private memory with execute permissions.
- Regions with no backing file.
- Regions whose size does not match any loaded module.
- `PAGE_EXECUTE_WRITECOPY` or `PAGE_EXECUTE_READWRITE` on non-image regions.

### Step 5: YARA over memory

YARA can scan raw memory or specific regions. Two approaches:

1. Extract the memory region and run `yara` on the file.
2. Use Volatility's YARA integration (`yarascan` plugin) to scan all processes.

```bash
# YARA over the whole memory image (slow but thorough)
yara -r rules/ memory.raw

# Volatility's built-in YARA scan
vol -f memory.raw windows.yarascan --yara-file rules/suspicious.yar
```

`yarascan` returns PID, rule name, and the matching string offset. It is slower than `malfind` but catches non-PE payloads like shellcode and configuration blocks.

For targeted scans, dump a suspicious region first:

```bash
vol -f memory.raw windows.vadinfo --pid 1234 --dump
# Then run yara on the dumped region
```

### Step 6: Dump the suspicious process or DLL

Once `malfind` or `hollowfind` identifies a PID, extract the payload:

```bash
# Dump all DLLs and injected code from a PID
vol -f memory.raw windows.dlllist --pid 1234
vol -f memory.raw windows.dlldump --pid 1234 --dump

# Dump a specific memory region
vol -f memory.raw windows.vaddump --pid 1234 --base 0x7ff60000 --dump
```

`dlldump` reconstructs a DLL from memory. `vaddump` dumps a raw VAD region. The output is a file you can analyze in IDA, Ghidra, or Binary Ninja.

### Step 7: Triage the implant

Take the dumped payload and run it through the standard triage pipeline from [`../06-topics/malware-analysis.md`](../06-topics/malware-analysis.md):

```bash
diec implant.exe
capa implant.exe -j > capa.json
floss -n 8 implant.exe > strings.txt
yara -r rules/ implant.exe
```

The dumped file often has no valid PE header. Fix it with `pefix` or load it in Ghidra as a raw binary at the correct base address.

## Tool Catalog

### Acquisition

| Tool | OS | Repo | Notes |
|---|---|---|---|
| WinPmem | Windows | `github.com/Velocidex/WinPmem` | Signed binaries. Raw output. Three read methods |
| LiME | Linux/macOS | `github.com/504ensicsLabs/LiME` | Loadable kernel module. Lime or raw format |
| procdump | Windows | `learn.microsoft.com/sysinternals` | Process dumps only. Fast triage |
| dump-memory | macOS | `github.com/volatilityfoundation/dump-memory` | Alternative to LiME for macOS |
| Hibernation file | Windows | `C:\hiberfil.sys` | Partial image. No tool needed |
| Crash dump | Windows | `MEMORY.DMP` or minidump | Volatility reads it directly |

### Analysis

| Tool | Repo | Notes |
|---|---|---|
| Volatility 3 | `github.com/volatilityfoundation/volatility3` | The framework. Python 3.8+. Plugin architecture |
| pe-sieve | `github.com/hasherezade/pe-sieve` | Live process scanner. Dumps implants from a running process. See [`../04-dynamic/unpacking-dumping.md`](../04-dynamic/unpacking-dumping.md) |
| hollows_hunter | `github.com/hasherezade/hollows_hunter` | Multi-process wrapper around pe-sieve |
| YARA | `github.com/VirusTotal/yara` | Signature matching. Runs on files or memory regions |
| capa | `github.com/mandiant/capa` | Capability detection. Runs on dumped PE files |
| FLOSS | `github.com/mandiant/flare-floss` | String extraction. Runs on dumped PE files |

### Volatility 3 plugins for injection hunting

| Plugin | What it finds |
|---|---|
| `windows.malfind` | Injected code, shellcode, PE headers in private memory |
| `windows.hollowfind` | Process hollowing. Compares memory image to disk file |
| `windows.psscan` | Hidden or terminated processes |
| `windows.vadinfo` | Full VAD tree. Manual review tool |
| `windows.dlllist` | Loaded DLLs per process |
| `windows.dlldump` | Reconstruct DLLs from memory |
| `windows.vaddump` | Dump a specific VAD region |
| `windows.yarascan` | YARA rules over all process memory |
| `windows.pesieve` | Volatility 3 port of pe-sieve logic. Reports injected PEs |
| `windows.ssdt` | System Service Descriptor Table. Kernel rootkit detection |
| `windows.callbacks` | Kernel callback enumeration. Rootkit detection |

## LLM-Assisted Workflows

### Write a Volatility plugin

Volatility 3 plugins are Python classes. The framework uses a plugin registry. A minimal plugin looks like this:

```python
from volatility3.framework import interfaces, renderers
from volatility3.framework.configuration import requirements
from volatility3.plugins.windows import pslist

class SuspiciousVad(interfaces.plugins.PluginInterface):
    """List VAD regions with execute permissions and no file backing."""

    _required_framework_version = (2, 0, 0)
    @classmethod
    def get_requirements(cls):
        return [
            requirements.ModuleRequirement(name="kernel", description="Windows kernel"),
            requirements.PluginRequirement(plugin_name="windows.pslist", version=(1, 0, 0)),
        ]

    def _generator(self):
        kernel = self.context.modules[self.config["kernel"]]
        # Iterate VAD trees, filter for private executable regions
        # Yield rows for the renderer
        pass

    def run(self):
        return renderers.TreeGrid(
            [("PID", int), ("Process", str), ("VAD Base", hex), ("Size", int), ("Protect", str)],
            self._generator(),
        )
```

Ask the LLM to write the plugin. Give it the Volatility 3 API docs and one existing plugin as a template. The model writes the skeleton. You fill in the VAD traversal logic. Verify with `vol -f sample.raw windows.suspiciousvad --help`.

### Summarize Volatility output into a report

Feed the JSON output of `malfind`, `hollowfind`, and `psscan` to an LLM. Ask for a structured report:

```
Read malfind.json, hollowfind.json, and psscan.txt.
Produce:
1. A table of suspicious PIDs with the evidence for each.
2. A ranked list of processes to dump first.
3. Open questions. Do not guess.
```

The model reads structured output well. It does not read raw hex dumps well. Always convert Volatility output to JSON before prompting.

### Generate YARA rules from strings

Extract suspicious strings from a dump:

```bash
strings -a memory.raw | grep -i "http\|powershell\|cmd.exe\|schtasks" > suspicious_strings.txt
```

Feed the strings to an LLM. Ask for YARA rules:

```
Write YARA rules for these strings. Use wide and ascii modifiers. Tag each rule with a descriptive name.
```

Verify each rule against the memory image with `yara`. Discard rules that match legitimate Windows processes.

### Explain a suspicious VAD region

Dump the region and feed the bytes to a multimodal model or a disassembler:

```bash
vol -f memory.raw windows.vaddump --pid 1234 --base 0x7ff60000 --dump
# Output: vad_1234_0x7ff60000.dmp
```

Ask the LLM: "Disassemble this region and explain the control flow." The model works better on disassembled text than on raw bytes. Use Capstone or `objdump` first.

## Pitfalls

- **Volatility 3 only.** Volatility 2 is deprecated. Do not use it. The plugin API changed completely.
- **Symbol tables are mandatory.** Without them, Windows plugins fail. Download `windows.zip` and place it correctly. First run builds the cache and is slow.
- **Raw memory is huge.** A 16 GB dump produces gigabytes of output. Always filter by PID or use `--pid` before dumping.
- **`malfind` has false positives.** JIT compilers, .NET, and some browsers create executable private memory. Review each hit manually.
- **Hibernation is partial.** `hiberfil.sys` does not contain all of RAM. Some processes may be missing. It is a fallback, not a primary source.
- **WinPmem needs admin.** The driver must load. On a locked-down host, use a WinPE environment or a sandbox.
- **procdump is not full memory.** It dumps one process. It misses kernel implants and other processes' injected code. Use it for quick triage, not full analysis.
- **YARA over memory is slow.** Scanning 16 GB takes hours. Use `yarascan` inside Volatility for process-level scanning, or scan extracted regions.
- **Dumped PEs may be corrupted.** The in-memory image differs from disk. Fix headers with `pefix` or load as raw binary.
- **LLM hallucination on memory output.** The model may invent VAD addresses or PID names. Always verify against the raw Volatility output.
- **Memory acquisition is noisy.** The act of dumping can trigger anti-forensics. Some malware detects WinPmem or LiME and wipes memory. Run acquisition early in the investigation.
- **Encrypted memory.** Some malware encrypts its own memory regions. `malfind` finds the region but the bytes are ciphertext. You need the key from another source.

## See Also

- [`../06-topics/malware-analysis.md`](../06-topics/malware-analysis.md) — static and dynamic malware triage pipeline
- [`../04-dynamic/unpacking-dumping.md`](../04-dynamic/unpacking-dumping.md) — live process dumping, pe-sieve, Scylla, IAT rebuild
- [`../07-advanced/anti-analysis.md`](../07-advanced/anti-analysis.md) — anti-dump and anti-forensics techniques
- [`../05-tools/tool-catalog.md`](../05-tools/tool-catalog.md) — full tool index including Volatility and YARA
- [`../02-collab/prompt-patterns.md`](../02-collab/prompt-patterns.md) — prompt templates for LLM-assisted analysis
- [`../03-decomp/verification-loop.md`](../03-decomp/verification-loop.md) — verifying agent claims before trusting them
