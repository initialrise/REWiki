# Firmware and IoT RE with AI

> Tags: firmware | embedded | IoT | binwalk | QEMU | Ghidra | difficulty: advanced | prerequisites: binary RE basics, ELF/ARM familiarity, Linux CLI

## Overview

Firmware reverse engineering has a long pipeline. Extract the image. Identify the operating system. Recover the kernel and userland. Boot the firmware. Reach the web UI or shell. Then decompile the interesting binaries. AI helps at every stage, but it works best as an analysis layer over deterministic extraction. Do not feed raw flash dumps to a model. Run extraction tools first. Then let the model reason over files, strings, and decompiled output.

This page covers the modern toolchain for 2026. The pipeline:

1. Extract the firmware image with Binwalk v3, unblob, or Firmwalker.
2. Scan for secrets and interesting files with Firmwalker or EMBA.
3. Rehost Linux firmware in QEMU with FirmAE or Firmadyne.
4. Decompile ARM and MIPS binaries with Ghidra or Binary Ninja through MCP.
5. Access hardware debug interfaces with probe-rs through flashprobe-mcp.
6. Verify model claims with Unicorn or Renode execution oracles.

## Setup

### Extraction tools

Install Binwalk v3, unblob, and Firmwalker on a Linux analysis host.

```bash
pip install binwalk3 unblob firmwalker
# unblob also ships a Docker image:
docker run -v "$PWD:/work" onekeysec/unblob firmware.bin --output /work/extracted
```

`binwalk3` is the Rust rewrite of binwalk. It scans signatures, shows entropy, and extracts recursively. `unblob` (github.com/onekey-sec/unblob) handles more than 78 container and filesystem formats. It writes JSON reports you can feed to an agent. `firmwalker` (github.com/craigz28/firmwalker) walks an extracted root filesystem and flags web interfaces, CGI scripts, and hardcoded credentials.

### Analysis platforms

FACT (github.com/fkie-cad/FACT_core) is a web-UI platform for firmware analysis, comparison, and SBOM generation. It has a REST API, so an agent can query it programmatically. EMBA (github.com/e-m-b-a/emba) scans firmware for malware indicators and vulnerabilities. It can also emulate firmware.

For Ghidra loaders for firmware formats such as PCI ROM, FMAP/IFD/CBFS, and UEFI FV/FFS, install ghidra-firmware-utils (github.com/al3xtjames/ghidra-firmware-utils).

### Emulation

- FirmAE (github.com/pr0v3rbs/FirmAE): automated rehosting of Linux-based firmware in QEMU. The current standard for getting a firmware image to boot.
- Firmadyne (github.com/firmadyne/firmadyne): the original QEMU firmware emulation framework. Mature but slower to set up. Treat as legacy.
- QEMU user-mode (`qemu-arm`, `qemu-mips`): run single ARM or MIPS binaries on your host without a full firmware image.
- Unicorn (github.com/unicorn-engine/unicorn): CPU-level emulator. Use it as an execution oracle to verify what a decompiled function really does.
- Renode (github.com/renode/renode): full-system emulator with good peripheral models for bare-metal targets.

### Hardware access

flashprobe-mcp (github.com/okhsunrog/flashprobe-mcp) exposes probe-rs and espflash over MCP. It gives an agent bounded UART capture plus JTAG, SWD, and flash read/write on supported targets. jlink-mcp (github.com/Klievan/jlink-mcp) wraps J-Link, OpenOCD, and Black Magic probes. probe-rs itself (github.com/probe-rs/probe-rs) supports many Cortex-M and RISC-V probes.

## How It Works

### AI-assisted firmware platforms

Several research projects automate parts of this pipeline:

| Project | Source | Approach |
|---|---|---|
| FIRMHIVE | arxiv.org/abs/2511.18438 | Recursive tree-of-agents for firmware security analysis |
| FirmAgent | github.com/vul337/FirmAgent | NDSS 2026. IDA pre-fuzzing, QEMU rehosting, LLM taint-to-PoC |
| FirmLLM | github.com/zhang-xr/FirmLLM | Multi-agent firmware collection and analysis |
| ripcord | github.com/DavidClawson/ripcord | PyGhidra to DuckDB fact warehouse, execution oracle, Claude skills |
| HexGraph | github.com/branover/hexgraph | Sandboxed agentic vulnerability-research platform |
| revenant | github.com/DatanoiseTV/revenant | LLM RE for abandoned hardware. Peripheral inventory and pin-map reconstruction |
| binary-re | github.com/2389-research/binary-re | Claude plugin for hypothesis-driven ARM/ELF RE |

The ripcord pattern is worth copying even without the tool. Extract facts deterministically into a queryable store such as DuckDB or Parquet. Let the agent query the store instead of re-reading binaries.

### Where the AI adds value

The AI is strongest at these tasks:

- Triaging extracted files. Point the model at `firmwalker.sh` output and a directory listing. Ask it to rank the most security-relevant binaries.
- Explaining decompiled ARM or MIPS code. Feed Ghidra decompilation into the model in chunks. Ask for a summary of inputs, outputs, and side effects.
- Matching strings to functions. Give the model a strings dump plus a symbol table. Ask which function references each hardcoded credential.
- Proposing hypotheses. The model suggests what a custom loader or crypto routine does. You verify with Unicorn or Renode.

The AI is weakest at raw byte-level work and at claims you cannot check. Always require an execution or diff oracle for security claims.

## Step-by-Step

### 1. Extract the firmware image

```bash
binwalk3 firmware.bin                    # scan and show signatures
binwalk3 -e -C ./extracted firmware.bin  # extract recursively
unblob -e firmware.bin                   # extract with format detection
unblob firmware.bin --json-out report.json  # structured report
```

Check entropy output from binwalk3 first. High entropy regions may be compressed filesystems, encrypted partitions, or packed executables. unblob detects many of these automatically. Firmwalker runs after extraction:

```bash
./firmwalker.sh ./extracted
```

Review `firmwalker.txt` for web endpoints, CGI scripts, and credentials. Feed the report to your agent with a prompt such as:

```
Read firmwalker.txt and the extracted directory listing.
Rank the top 10 files worth reverse engineering.
For each, give the path, the file type, and why it is interesting.
Do not speculate about code you have not seen.
```

### 2. Identify kernels and binaries

For Linux firmware, identify the kernel version and architecture. Then run vmlinux-to-elf (github.com/marin-m/vmlinux-to-elf) to rebuild an ELF with symbols from kallsyms:

```bash
vmlinux-to-elf vmlinux.bin vmlinux.elf
```

List the userland binaries and note their architectures:

```bash
find ./extracted -type f -exec file {} + | grep -E "ELF|executable"
```

Common firmware architectures: ARM little-endian 32-bit (armv7, armhf), MIPS big-endian or little-endian, sometimes AArch64, RISC-V, or x86 for gateway devices.

### 3. Rehost the firmware

For Linux firmware, try FirmAE first:

```bash
git clone https://github.com/pr0v3rbs/FirmAE
cd FirmAE
./firmadyne.sh init    # downloads dependencies
./firmadyne.sh run ./extracted_image.bin
```

FirmAE uses QEMU user-mode and full-system emulation to boot the firmware. It maps web interfaces to local ports. Check the console output for login prompts or web server ports. If the web UI boots, you can probe it with curl and drive it through the AI agent.

For bare-metal firmware or non-Linux images, use QEMU user-mode for single binaries or Renode for full-system emulation with peripheral models.

### 4. Decompile with Ghidra or Binary Ninja

Load the extracted binaries into Ghidra. For firmware container formats such as UEFI firmware volumes, install ghidra-firmware-utils first. For headless analysis, use PyGhidra or the Ghidra MCP server. The agent can then call decompilation on demand.

A practical prompt pattern:

```
Decompile function at 0x80001234.
Summarize: what it reads, what it writes, what it returns.
Flag any crypto constants, format strings, or network calls.
If the decompilation is ambiguous, list the specific instructions that caused the ambiguity.
```

For ARM binaries, check the calling convention. ARM EABI uses r0–r3 for the first four arguments. MIPS o32 uses a0–a3. Ghidra usually handles this, but verify when the decompilation looks wrong.

### 5. Use FACT for web-UI and SBOM analysis

FACT (github.com/fkie-cad/FACT_core) gives you a web interface for firmware comparison and SBOM generation. Its REST API lets an agent query analysis results:

```bash
# Start FACT, upload firmware, then query the API
curl -s http://localhost:5000/api/v1/projects | jq
```

Ask the agent to compare two firmware versions. The diff often reveals patched vulnerabilities or changed crypto. FACT's SBOM output helps you identify third-party components with known CVEs.

### 6. Hardware access with probe-rs and flashprobe-mcp

For physical devices, connect a debug probe. flashprobe-mcp wraps probe-rs and espflash for MCP-compatible agents:

```bash
# Example MCP config for flashprobe-mcp
{
  "mcpServers": {
    "flashprobe": {
      "command": "flashprobe-mcp",
      "args": ["--chip", "STM32F407VG"]
    }
  }
}
```

The agent can then read flash, run bounded UART captures, and write firmware through the MCP tools. Keep captures bounded. Long UART sessions flood the context window. Ask the agent to filter for boot messages, login prompts, or AT command responses.

For J-Link or OpenOCD probes, use jlink-mcp instead.

### 7. Verify claims with an execution oracle

When the agent claims a function does X, verify it. Options:

- Unicorn: emulate the function in Python with stubbed memory.
- Renode: run the full system and observe peripheral access.
- QEMU user-mode: run the binary with controlled inputs.
- GDB on hardware: set breakpoints through probe-rs.

A minimal Unicorn check for an ARM function:

```python
from unicorn import Uc, UC_ARCH_ARM, UC_MODE_ARM
from unicorn.arm_const import *

mu = Uc(UC_ARCH_ARM, UC_MODE_ARM)
mu.mem_map(0x80000000, 0x10000)
# load code and data
mu.emu_start(0x80001234, 0x80001300)
print(hex(mu.reg_read(UC_ARM_REG_R0)))
```

## AI-Assisted String and Config Extraction

Firmware contains many strings. Credentials, URLs, crypto keys, and debug commands hide among them. Do not paste a raw strings dump into the model. Filter first.

```bash
# Extract strings with context
strings -a -n 6 firmware.bin > strings.txt

# Filter for interesting patterns
grep -iE "password|token|key|secret|api|http|ssh|telnet|admin" strings.txt > interesting_strings.txt
```

Then ask the agent:

```
Read interesting_strings.txt.
Group strings by category: credentials, network endpoints, crypto material, debug commands.
For each group, give the file offset or surrounding strings that identify the source binary.
Flag anything that looks like a hardcoded key or default password.
```

For config files, extract them from the filesystem and ask the agent to diff them across firmware versions. Changed default passwords or new endpoints often reveal security fixes.

For encrypted or packed binaries, use Firmwalker or EMBA to identify them first. Then ask the agent to suggest unpacking strategies based on the file type and entropy profile.

## Pitfalls

### Endianness

ARM and MIPS firmware comes in both endiannesses. Check `file` output or the ELF header before loading into Ghidra. Wrong endianness produces garbage decompilation. For raw binaries without ELF headers, you must set the endianness manually in Ghidra's loader options.

### Custom loaders and bootloaders

Many firmware images have custom headers or loaders that Binwalk does not recognize. The first bytes may be a proprietary header, not a standard magic. If extraction yields nothing useful, check the first 64 bytes manually. Look for repeated patterns, XOR-encrypted regions, or known bootloader signatures. You may need to write a custom Binwalk signature or carve the image manually.

### Compressed and encrypted partitions

SquashFS, JFFS2, UBIFS, and CramFS are common. unblob handles many of them. For encrypted partitions, you need the key. Keys often live in the bootloader, a separate partition, or are derived from device serials. The agent can help search for key-derivation routines in the decompiled bootloader, but you must verify the derivation with Unicorn or hardware.

### Kernel versus userland

Do not decompile the kernel as a single binary. Extract vmlinux first, then analyze userland binaries separately. Kernel modules (.ko files) need their own analysis. The agent can help identify which module handles a given peripheral or protocol.

### Web UI versus backend

FACT and Firmwalker identify web interfaces, but the interesting logic often lives in CGI binaries or backend daemons. Trace from the web endpoint to the binary that handles it. The agent can map URL paths to CGI scripts, but you must confirm the mapping in the extracted filesystem.

### Emulation gaps

FirmAE and Firmadyne work well for Linux firmware but fail on bare-metal, RTOS, or heavily customized images. QEMU user-mode does not emulate peripherals. Unicorn has no OS layer. When emulation fails, fall back to static analysis and hardware debugging.

### AI hallucination on firmware

Models often invent function names, string meanings, or protocol behaviors. Require citations: file offsets, decompiled lines, or execution traces. If the agent cannot point to evidence, treat the claim as unverified. Use the ripcord pattern: extract facts first, let the agent query them, and verify with an execution oracle.

### Hardware access risks

flashprobe-mcp and jlink-mcp give agents direct hardware access. A wrong write can brick a device. Restrict write operations to a test device. Keep flash backups before any write. Use bounded captures to avoid flooding the context window.

## See Also

- [Verification loop](../03-decomp/verification-loop.md) — verifying decompiler output with execution oracles
- [MCP catalog](../05-tools/mcp-catalog.md) — headless Ghidra analysis and MCP integration
- [Unicorn and Qiling](../04-dynamic/emulation-unicorn-qiling.md) — Unicorn for function-level emulation
- [Android native `.so`](./android-native-so.md) — Android firmware extraction and analysis
- [Hardware RE: UART, JTAG, SWD, chip-off](../07-analysis/hardware-jtag.md) — UART consoles, debug probes, chip-off, flash programmers
- [Protocol reverse engineering](./protocol-reverse.md) — PCAP to grammar after hardware capture
