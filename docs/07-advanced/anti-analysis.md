# Defeating Anti-Analysis: Anti-Debug, Anti-VM, Anti-Dump

> Tags: anti-debug, anti-vm, unpacking, x64dbg, frida, scyllahide | Difficulty: intermediate | Prerequisites: `../04-dynamic/x64dbg-windbg.md`, `../06-topics/packed-binaries.md`

## Overview

Protected malware and license-checked crackmes run checks before they let you analyze them. They test for debuggers. They test for virtual machines. They test for sandboxes. They run self-integrity checks. When a check fires, the program exits, hangs, corrupts data, or decrypts garbage.

The goal is not to defeat every check permanently. The goal is to observe the code that runs before and after the checks. You then pick the checks you need to neutralize.

Work in this order:

1. Identify what protects the sample.
2. Pick your runtime. x64dbg plus ScyllaHide for native Windows binaries. Frida for scriptable instrumentation. A real VM for VM-aware targets.
3. Neutralize only the checks that block your path.
4. Record what you patched. You will need to undo patches on a fresh copy.

Assume every check is a hypothesis until you see it fire. Many samples run decoy checks that look dangerous but change nothing.

## The Checks You Will Meet

Group the checks by family. Each family has a different countermeasure.

### Debugger checks

| Check | How it works | Detection points |
|---|---|---|
| `IsDebuggerPresent` | Reads `BeingDebugged` in the PEB (Process Environment Block) | PEB offset `+0x02` on x64 and x86 |
| `CheckRemoteDebuggerPresent` | Same PEB flag through an API | Same flag, different call path |
| `NtQueryInformationProcess` | Asks the kernel for `ProcessDebugPort`, `ProcessDebugObjectHandle`, `ProcessDebugFlags` | Three classes: 7, 30, 31 |
| Hardware breakpoints | Reads DR0-DR7 with `GetThreadContext` or `NtGetContextThread` | Debug registers visible to any debugger |
| `NtSetInformationThread` | Hides the debugger thread with `ThreadHideFromDebugger` | Breaks user-mode-only debuggers. Kernel debugging still works |
| `OutputDebugString` trick | The string is not delivered when no debugger listens. Deliberately trigger an exception too | Timing and `SetLastError` changes |
| INT3 scan | Scans own code for `0xCC` bytes that a debugger wrote as breakpoints | Software breakpoints visible in memory |
| Self-debug / `DebugActiveProcess` | Debugs itself. Any second debugger fails to attach | One debugger slot per process |
| Timing checks | `rdtsc`, `QueryPerformanceCounter`, `GetTickCount` around a block. A debugger slows the block | Single-step and breakpoint traps cost time |
| Trap flags | `pushfd`/`popfd` or `EFLAGS.TF` inspection | Breakpoints and single steps leave TF traces |
| CloseHandle with invalid handle | `CloseHandle(0xDEADBEEF)` raises an exception under a debugger | `STATUS_INVALID_HANDLE` caught and read |

### VM and environment checks

| Check | Artifacts it looks for |
|---|---|
| VM vendors | CPUID hypervisor bit and vendor strings: `VMwareVMware`, `VBoxVBoxVBox`, `Microsoft Hv`, `XenVMMXenVMM`, `prl hyperv` (Parallels) |
| MAC address | VMware, VirtualBox, and Hyper-V OUI ranges |
| Registry keys | `HKLM\SOFTWARE\VMware, Inc.`, `HKLM\SOFTWARE\Oracle\VirtualBox Guest Additions`, `HKLM\SYSTEM\...\Control\SystemInformation` |
| Drivers and devices | `vmci.sys`, `VBoxGuest`, `vmmouse`, `vmhgfs`, disk model names, ACPI tables (`VMWARE`, `VBOX`) |
| Processes and services | `vmtoolsd.exe`, `VBoxService.exe`, `vmwaretray.exe` |
| Firmware tables | SMBIOS strings, ACPI OEM IDs, `HKLM\HARDWARE\DESCRIPTION\System\BIOS` |
| Timing artifacts | VM exits and emulated instructions run slower. Noisy neighbor jitter |

### Analysis-ecosystem checks

| Target | Artifacts |
|---|---|
| Sandbox VMs | Known hypervisor MACs, low CPU count, small RAM, fresh user profiles, no browser history |
| Debugging tools | Window titles and class names of IDA, x64dbg, Wireshark, Procmon, Fiddler, HTTP debuggers |
| Analysis processes | Process names of `ida.exe`, `x64dbg.exe`, `frida-server`, `wireshark.exe`, `procmon.exe` |
| Hooks and instrumentation | Function prologue integrity, `int3` scans, CRC of code pages, detection of inline hooks and page guards |

### Self-protection

| Mechanism | What it does |
|---|---|
| Anti-dump | Erases or corrupts PE headers after load. Fakes section sizes. Guards dump APIs |
| Code encryption | Sections decrypt on demand. Decrypted pages re-encrypt after use |
| Opaque predicates and junk code | Dead branches and meaningless operations. AI handles these poorly at scale. Remove them deterministically first |
| Section hashing | Periodic CRC over code. Any patch changes the hash |
| VEH and SEH abuse | Exception handlers double as control flow. Normal debugging hides exceptions the program expects |

## Packing First

Run a packing check before you fight anti-analysis. The order matters.

1. Run `diec` (Detect It Easy, github.com/horsicq/DIE-engine) or `exeinfope` on the file. Look for `UPX`, `MPRESS`, `ASPack`, `VMProtect`, `Themida`, `Enigma`, `.vmp` sections.
2. Run `pe-sieve` (github.com/hasherezade/pe-sieve) on a running process. It finds injected PEs, shellcode, and in-memory patches. A packed sample often shows as a replaced image plus a second payload.
3. If the sample unpacks at runtime, dump memory after unpacking instead of patching checks on disk. See `../06-topics/packed-binaries.md`.
4. If the sample is VMProtect or Themida protected, the anti-debug layer is inside the protector. Fight it with debugger stealth first, then move to static devirtualization only for the functions you need. See `../06-topics/deobfuscation.md`.

Packed samples hide their anti-analysis behind the unpacker stub. Bypass the packer and you often bypass the checks for free.

## Setup

### x64dbg plus ScyllaHide

ScyllaHide (github.com/x64dbg/ScyllaHide) is the standard user-mode anti-anti-debug library for x64dbg, OllyDbg, and IDA. It hooks `IsDebuggerPresent`, `NtQueryInformationProcess`, `NtQuerySystemInformation`, timing functions, and thread-context reads.

Install it:

1. Download the latest release from github.com/x64dbg/ScyllaHide/releases.
2. Copy the x64 plugin `ScyllaHideX64DBGPlugin.dp64` into `x64dbg\release\x64\plugins\`. Copy `ScyllaHideX32DBGPlugin.dp32` for x32dbg.
3. Copy the profile `scylla_hide.ini` (or `scylla_hide_x64.ini` / `scylla_hide_x32.ini`) into the x64dbg settings folder.
4. Start x64dbg and load a process.

The plugin ships with three profiles. `VMProtect x86/x64` and `Themida x86/x64` profiles enable more hooks. Start with the default profile. Add hooks only when a check still fires.

The plugin hooks `IsDebuggerPresent`, `CheckRemoteDebuggerPresent`, `NtQueryInformationProcess`, `NtQuerySystemInformation`, `NtClose`, `NtSetInformationThread`, `GetTickCount`, `QueryPerformanceCounter`, `NtQueryObject`, and more. Review `HookLibrary` in the repo for the full list.

Enable kernel mode (TitanHide) only when a driver checks for debuggers or user-mode hooks get detected. TitanHide (github.com/mrexodia/TitanHide) hides the debugger at kernel level. It requires a signed driver load path and test-signing or DSE bypass. That is a separate setup. See `../06-topics/windows-kernel-drivers.md`.

### Frida

Frida (github.com/frida/frida) instruments processes from outside the debugger. It is the right tool for checks you want to observe, not patch. You hook a function. You log its arguments. You force a return value. You do not set breakpoints.

Attach to a running process:

```bash
frida -n target.exe -l bypass.js
```

Spawn and hook from start:

```bash
frida -f target.exe -l bypass.js --no-pause
```

`--no-pause` resumes the process immediately after the script loads. Use it when the anti-analysis runs early in `main`.

Frida is more detection-friendly than a debugger for some checks and less for others. A `frida-server` process is a named artifact. A gadget or injected library inside the target is another. See the pitfalls section.

### Debugging under a real VM

For samples that check hypervisor artifacts, run the analysis VM on a hypervisor that does not match the checked vendor.

| Your VM | Notes |
|---|---|
| VMware Workstation/ESXi | Best documented anti-VM bypasses. Edit the `.vmx` file |
| VirtualBox | Easy to spoof MAC and SMBIOS. Many checks target it explicitly |
| Hyper-V | Windows-native. `hv` CPU flag is hard to hide |
| KVM/QEMU | Most configurable. Set custom SMBIOS strings, MACs, and CPUID |
| Bare metal | Zero artifacts. Cost: one machine per sample |

A full anti-VM hardening guide is its own page: `./anti-analysis.md`.

## Step-by-Step

### 1. Identify the protection

```bash
# Detect It Easy — fast triage
diec target.exe
# Look for: VMProtect, Themida, Enigma, UPX, .vmp sections

# pe-sieve on the running process — catches runtime unpacking and injection
pe-sieve64.exe /pid 1234
# Watch for: implanted PEs, shellcode, replaced images
```

In x64dbg, look at the section names and entry point. `.vmp0`, `.themida`, `.enigma1`, or an entry point that jumps into a small stub that jumps back into the binary are packer signatures.

### 2. Run it under a debugger once

Start with no stealth. Let the program run and see what it does when a check fires. Common outcomes:

- Process exits silently. Check exit code and last API call.
- Process hangs. Look for a `Sleep` loop or a thread that never returns.
- Data corruption. A check writes bad keys or truncates output.
- Fake success. The program reports success but the real work never ran.

Find the check by tracing backward from the exit or the hang. Set a breakpoint on `ExitProcess`, `TerminateProcess`, and `NtTerminateProcess`. Walk the stack to the caller.

### 3. Enable ScyllaHide profiles

In x64dbg, Plugins > ScyllaHide > Options. Select the profile matching the protector:

- Default `scylla_hide.ini` for generic anti-debug.
- `VMProtect x64` for VMP-protected samples.
- `Themida x64` for Themida-protected samples.

If a check still fires after ScyllaHide, the check is not one of the hooked APIs. It is a direct PEB read, a timing check, or an artifact ScyllaHide does not cover. Move to Frida or manual patching.

### 4. Write a Frida bypass script

A bypass script does three things: hook the check, log when it fires, return the safe value.

Example for a Windows target:

```javascript
// bypass.js
function log(msg) { console.log("[*] " + msg); }

// Hook the common APIs
var isDebuggerPresent = Module.findExportByName("kernel32.dll", "IsDebuggerPresent");
if (isDebuggerPresent) {
    Interceptor.attach(isDebuggerPresent, {
        onLeave: function(retval) {
            log("IsDebuggerPresent called, forcing false");
            retval.replace(0);
        }
    });
}

var checkRemote = Module.findExportByName("kernel32.dll", "CheckRemoteDebuggerPresent");
if (checkRemote) {
    Interceptor.attach(checkRemote, {
        onEnter: function(args) {
            this.pbDebuggerPresent = args[1];
        },
        onLeave: function(retval) {
            try {
                this.pbDebuggerPresent.writeU32(0);
            } catch (e) { /* not a pointer on some targets */ }
            retval.replace(1); // CheckRemote returns success even when flag is false
        }
    });
}

// NtQueryInformationProcess — the three debug classes
var ntdll = Module.findExportByName("ntdll.dll", "NtQueryInformationProcess");
if (ntdll) {
    Interceptor.attach(ntdll, {
        onEnter: function(args) {
            this.infoClass = args[1].toInt32();
            this.buf = args[2];
        },
        onLeave: function(retval) {
            if (this.infoClass === 7) {        // ProcessDebugPort
                this.buf.writePointer(ptr(0));
                retval.replace(0);
            } else if (this.infoClass === 30) { // ProcessDebugObjectHandle
                this.buf.writePointer(ptr(0));
                retval.replace(0xC0000353);   // STATUS_PORT_NOT_SET
            } else if (this.infoClass === 31) { // ProcessDebugFlags
                this.buf.writeU32(1);          // 1 = not being debugged
                retval.replace(0);
            }
        }
    });
}
```

The script above covers the three most common user-mode checks. Real samples add more: `NtSetInformationThread(ThreadHideFromDebugger)`, `NtQuerySystemInformation(SystemKernelDebuggerInformation)`, hardware-breakpoint reads through `GetThreadContext`, and direct PEB reads.

### 5. Generate the script with AI

Give the model the decompiled check, not the raw bytes. The check is usually a small function. Ask for a bounded hook.

Prompt template:

```
Here is the decompiled function that detects the debugger in this PE.
It uses [list the APIs you saw: IsDebuggerPresent, NtQueryInformationProcess, rdtsc].

Write a Frida JavaScript script that:
1. Hooks each detection API.
2. Logs when the hook fires with the function name and arguments.
3. Returns the value that means "not being debugged".
4. Does not touch any other function.

Function:
<decompiled pseudocode>
```

Attach the script. Run the target. If a check still fires, find the missing API in the decompilation and extend the script. Iterate one check at a time. Do not try to bypass everything at once.

AI is good at generating the hook boilerplate. It is bad at knowing which return value the program expects. Verify against the decompiled check. A wrong return value can make the program take a different, also-failing path.

### 6. Patch the check on disk when runtime bypass fails

Some checks cannot be hooked cleanly:

- Direct PEB reads with no API call.
- Integrity checks that hash the code you hooked.
- Timing checks that detect the hook overhead itself.
- Drivers that check from kernel mode.

For those, patch the binary. In x64dbg:

1. Find the check in the disassembly.
2. Replace the conditional jump with `NOP` + `JMP` to the safe path, or flip `JZ` to `JNZ` when the logic is inverted.
3. Fix section checksums if the file has them. PE checksum is at `OptionalHeader.CheckSum`. Most user-mode binaries ignore it. Signed binaries do not.
4. Re-test on a fresh copy.

Patching is fragile. The sample may self-hash and detect the patch. It may have multiple copies of the check. It may re-check later. Runtime bypass with Frida or ScyllaHide survives more of these because the file on disk stays clean.

### 7. VM detection evasion

If the target checks for VMs, you have three options:

1. **Change the hypervisor.** Move the analysis VM to a different hypervisor or bare metal. Cheapest option when you have the hardware.
2. **Spoof the artifacts.** Edit `.vmx` for VMware, use VBoxManage for VirtualBox, or set custom SMBIOS strings in QEMU. This is a cat-and-mouse game. New checks appear.
3. **Patch the check.** Same as anti-debug patching. Find the VM-check function and neutralize it.

Do not fight VM detection on the same VM you analyze other samples on. Keep a dedicated analysis VM for hostile targets.

### 8. When to go static

Drop the debugger when:

- The binary self-hashes and detects patches.
- The anti-debug is inside a kernel driver.
- The protection is VMProtect or Themida and you only need one function. Static devirtualization beats fighting the runtime.
- The sample uses anti-dump that corrupts memory you need.

Static path: load the binary in Ghidra or IDA. Identify the check function. Understand what it reads and returns. Write the equivalent logic as a Frida script that spoofs the data source, not the check. The program runs clean because it sees real-looking inputs.

For VMProtect and Themida, see `../06-topics/deobfuscation.md` and the Mergen tool (github.com/NaC-L/Mergen) for assembly-to-LLVM-IR lifting through the VM.

## Pitfalls

- **Do not hook everything at once.** A broad Frida script that hooks 50 functions changes timing enough to trip timing checks. Hook one check, verify, move on.
- **Do not trust the PEB flag alone.** Sophisticated samples read `PEB.BeingDebugged`, `PEB.NtGlobalFlag`, and `PEB.ProcessHeap->Flags` directly. ScyllaHide covers the API paths. Direct reads need a PEB patch or a hypervisor-level fix.
- **Timing checks are the hardest.** `rdtsc` deltas under a debugger can be 100x normal. Single-stepping is worse. If the sample times a tight loop, you may need to patch the comparison or run under a hypervisor that does not trap.
- **INT3 scans see software breakpoints.** x64dbg writes `0xCC` into code when you set a breakpoint. A scan finds them. Use hardware breakpoints (DR registers) for code the sample scans, or use memory breakpoints that do not modify code.
- **Frida is detectable.** `frida-server` is a named process. The injected `frida-agent` library has signatures. GumJS hooks leave inline trampoline patterns. For high-assurance targets, use a renamed gadget, a custom build, or go static.
- **ScyllaHide is not magic.** It covers known checks. New checks, custom checks, and kernel checks bypass it. Read the HookLibrary source to know what is covered.
- **Anti-dump corrupts your dump.** Scylla and pe-sieve fix common cases. Custom anti-dump needs manual header repair or a different dump point.
- **VM checks target your analysis VM specifically.** A sample that checks for `VBoxService.exe` will not fire on VMware. A sample that checks for `vmtoolsd.exe` will not fire on VirtualBox. Know which VM you are on.
- **Do not run hostile samples on your host.** Use the analysis VM or a microVM (Firecracker, Kata). See `../01-setup/agent-sandboxing.md`.
- **Prompt injection is real.** Decompiler output fed to an LLM can carry injected instructions (arXiv 2605.30667, 2605.30677). Read the decompiled check yourself before asking the model to write the bypass. Verify the generated script against the binary.
- **Do not patch signed binaries casually.** Signature checks will flag the patch. Some protectors re-verify signatures at runtime.

## See Also

- `../06-topics/packed-binaries.md` — unpack before fighting anti-analysis
- `../06-topics/deobfuscation.md` — VMProtect and Themida devirtualization
- `../04-dynamic/x64dbg-windbg.md` — debugger and Frida setup
- `./anti-analysis.md` — VM artifact reduction for analysis VMs
- `../01-setup/agent-sandboxing.md` — running hostile samples safely
- `./anti-analysis.md` — DR-register breakpoints that survive INT3 scans
- github.com/x64dbg/ScyllaHide — ScyllaHide source and profiles
- github.com/frida/frida — Frida framework
- github.com/hasherezade/pe-sieve — process memory scanner for packed/injected code
- github.com/mrexodia/TitanHide — kernel-mode anti-anti-debug driver
