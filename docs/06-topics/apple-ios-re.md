# iOS/macOS Reverse Engineering with AI

> Tags: ios, macos, macho, objective-c, swift, ipsw, ghidra, frida | Difficulty: Intermediate | Prerequisites: Mach-O binary format, basic Ghidra/IDA use, access to an iOS device or firmware file

iOS and macOS binaries use the Mach-O format. Most Apple system code ships inside dyld shared caches, not as standalone files. Objective-C metadata survives stripping. Swift metadata is harder but recoverable. AI tools work well on Apple binaries because the metadata gives the LLM class names, method names, and call sites for free.

## Overview

The Apple reversing workflow splits into three layers:

1. **Extraction.** Get the binary out of an IPA, an IPSW, a macOS app, or a dyld shared cache.
2. **Metadata recovery.** Recover Objective-C class and method names, Swift type names, and entitlements.
3. **Runtime instrumentation.** Use Frida to watch behavior on a jailbroken device.

AI fits each layer differently. LLMs are strong at naming functions, writing Frida scripts, and summarizing Objective-C class hierarchies. They are weak at decompiling large arm64e functions without a decompiler MCP in the loop. Pair an LLM with ipsw, Ghidra, or IDA and you get a usable pipeline.

## Setup

### Required tools

| Tool | Install | Purpose |
|---|---|---|
| ipsw | `brew install blacktop/tap/ipsw` | Mach-O and dyld cache inspection, class-dump, entitlements, firmware extraction |
| Ghidra | Ghidra 12.x | ARM64 decompilation. Native Mach-O and Objective-C loaders |
| IDA Pro | ida-pro.com | ARM64 decompilation with the Apple-oriented loaders and scripts |
| Frida | `pip install frida-tools` | Runtime instrumentation on jailbroken devices |
| radare2 or rizin | package manager | Fast triage, strings, xrefs before a full decompile |
| Python 3.11+ | python.org | Glue scripts, plist parsing, reporting |

On Linux, static analysis of already-extracted files works with Ghidra and radare2. ipsw runs on Linux too. Device-side work needs a Mac for Xcode command-line tools such as `otool`, `codesign`, and `plutil`.

### Optional AI tooling

| Tool | URL | What it adds |
|---|---|---|
| ipsw-skill | github.com/blacktop/ipsw | Agent skill for ipsw. Command reference and workflows for Claude Code, Codex, Gemini CLI |
| iOS-reverse-engineering-claude-skill | github.com/incogbyte/iOS-reverse-engineering-claude-skill | Full IPA analysis pipeline. ipsw class-dump, security audit, SDK fingerprinting, 14-category vulnerability audit |
| ioskit | github.com/Cassian433/ioskit | Jailbroken-device automation. Native device control plus 28-tool MCP server |
| frida-c2-mcp | github.com/s4dp4nd4/frida-c2-mcp | On-device Frida MCP for iOS and Android |
| kahlo-mcp | github.com/FuzzySecurity/kahlo-mcp | Frida session lifecycle MCP. Versioned module store |

## How It Works

### ipsw class-dump

ipsw reads Objective-C metadata from Mach-O files and dyld shared caches. It produces header files that look like the original SDK headers.

```bash
# Dump headers for one framework inside a dyld shared cache
ipsw class-dump /path/to/dyld_shared_cache_arm64e SpringBoardServices --headers -o headers

# Extract a framework first, then class-dump the Mach-O
ipsw dyld extract /path/to/dyld_shared_cache_arm64e Foundation -o extracted/
ipsw class-dump extracted/Foundation --headers -o headers/
```

Use `--headers` for `.h` files. Check `ipsw class-dump --help` for filter options that limit output to interesting classes.

ipsw also reads Swift metadata. The exact subcommand name has changed across releases. Run `ipsw --help` and `ipsw dyld --help` on your installed version. Do not assume a flag exists. Check the help output first.

### Mach-O analysis in Ghidra and IDA

Ghidra loads Mach-O files directly. It has an Objective-C analyzer that names functions like `-[ClassName methodName]` when metadata exists. IDA Pro 9.x has Mach-O loaders and ARM64 support.

Workflow for an IPA binary:

```bash
# Unzip the IPA and thin the fat binary
unzip target.ipa -d target_unpacked
lipo -thin arm64 target_unpacked/Payload/Target.app/Target -output Target.arm64

# Inspect load commands and entitlements
ipsw macho info Target.arm64
ipsw macho entitlements Target.arm64   # verify exact subcommand with --help

# Feed the thinned binary to Ghidra
analyzeHeadless /tmp/ghidra_project TargetProj \
  -import Target.arm64 \
  -postScript DecompileAllFunctions.java
```

In IDA, load the Mach-O and let the autoanalysis finish. Then ask the LLM to name functions from call-site context.

A common prompt pattern:

```text
Here is the decompiled function at 0x10003f4a0. The binary has Objective-C
metadata. Suggest a meaningful name for this function based on the selector
calls and string references. Output only the name and a one-line reason.
```

Batch this over hundreds of functions. The LLM is good at naming, bad at verifying correctness. Verify names by checking that the guessed selector actually appears in the class metadata.

### Entitlement analysis

Entitlements live in the Mach-O signature blob. Read them before you decompile anything. Entitlements tell you sandbox profile, keychain access, App Groups, and capabilities.

```bash
# Dump entitlements from a signed binary
codesign -d --entitlements :- Target.arm64

# Or use ipsw
ipsw macho info Target.arm64 --entitlements
```

For App Store IPAs the entitlements come from the provisioning profile too. Extract the profile from `embedded.mobileprovision` inside the `.app` bundle:

```bash
security cms -D -i target_unpacked/Payload/Target.app/embedded.mobileprovision > profile.plist
plutil -extract Entitlements xml1 -o - profile.plist
```

Feed the entitlement list to the LLM with a prompt like:

```text
List which of these entitlements widen the attack surface. Flag any that
allow app-group data sharing, keychain sharing across apps, or disabling
library validation. Cite the entitlement key for each finding.
```

### Jailbroken-device toolkits

For dynamic work you need a jailbroken device. palera1n supports iPhone X on iOS 14-16. Support for newer iOS versions is limited. Check the palera1n documentation for current device and version coverage. This changes often.

Cassian433/ioskit provides a 28-tool MCP server plus native device daemons:

```bash
pip install -e "ioskit/[all]"
cd device/iosctl   && make package install THEOS_DEVICE_IP=<device-ip>
cd device/axserver && make package install THEOS_DEVICE_IP=<device-ip>
ioskit doctor --host <ip>
ioskit mcp          # exposes tools to Claude Code or Claude Desktop
```

The MCP tools include `screenshot`, `ax_tree`, `tap`, `type_text`, `swipe`, `app_launch`, `frida_attach`, and `syslog_tail`. The SmartAgent layer records UI flows, repairs broken selectors with vision, and explores app state graphs automatically.

For pure Frida work, attach to a process and dump classes:

```javascript
// dump-classes.js — enumerate Objective-C classes at runtime
ObjC.enumerateLoadedClasses({
  onMatch: function(name) {
    console.log("CLASS: " + name);
  },
  onComplete: function() { console.log("DONE"); }
});
```

```bash
frida -U -f com.target.app -l dump-classes.js --no-pause
```

Frida gives you runtime Objective-C class names that static analysis misses, including classes loaded from plugins or downloaded code.

### AI-assisted workflows in practice

Recommended order for an unknown IPA:

1. Run the extraction and audit skill end to end. The incogbyte skill does this in one pass.
2. Read the entitlement report and protection score before touching assembly.
3. Class-dump the interesting frameworks. Feed headers to the LLM to map the app architecture.
4. Pick one bounded target. One login function, one crypto routine, one network interceptor.
5. Decompile that target in Ghidra or IDA through an MCP server. Ask the LLM to explain it.
6. Write a Frida hook for the same function. Compare static and dynamic views.
7. Verify every claim against the binary. LLM output is a hypothesis, not evidence.

## Step-by-Step

### Decrypt an App Store IPA

App Store IPAs are FairPlay-encrypted. You cannot decompile them directly. Options:

1. **frida-ios-dump** — attach to the running app on a jailbroken device and dump the decrypted binary. See github.com/AloneMonkey/Frida-IpaDump.
2. **ipsw** — can download and extract firmware, but IPA decryption still needs a jailbroken device or a decrypted IPA source.
3. **Corellium or similar cloud devices** — provide jailbroken iOS instances in the cloud. Whether current Corellium supports the iOS versions you need is unverified. Check corellium.com for current support.

After you have a decrypted binary, thin it and load it into Ghidra:

```bash
lipo -thin arm64 Target -output Target.arm64
ipsw macho info Target.arm64
```

### Recover Swift metadata

Swift binaries keep type metadata for reflection. Tools that read it:

- **ipsw** — has Swift metadata inspection in recent releases. Check `ipsw --help`.
- **dsymutil** — Apple's tool. Works on binaries with dSYM files.
- **swift-demangle** — demangles Swift symbols. Ships with the Swift toolchain.

```bash
swift-demangle '$s4Test3FooC3barSSvg'
# Output: Test.Foo.bar.getter : Swift.String
```

For mass demangling, pipe symbol output through `swift-demangle` before feeding to the LLM. Demangled names make decompiled code far easier to reason about.

### Write a Frida hook with AI assistance

Give the LLM the decompiled function and ask for a hook:

```text
This is the decompiled Objective-C method -[AuthManager loginWithUser:password:].
Write a Frida script that logs the username argument, the return value, and
the SSL certificate used in the request. Use ObjC.classes syntax.
```

The LLM produces a starting script. You must fix API details. Frida's ObjC bridge syntax changes between major versions. Check the Frida documentation for your installed version.

### Verify AI output

Every AI-generated claim needs a deterministic check:

- Function names: confirm the selector exists in class-dump output.
- Endpoint URLs: grep the binary strings for the URL.
- Entitlement claims: re-run `codesign -d --entitlements` and diff.
- Decompiler output: cross-reference the address in Ghidra or IDA.

Store claims in a file with evidence links. The ReVa skills pattern requires this. See the skill-writing section of the main research for the evidence contract pattern.

## Pitfalls

- **arm64e pointer authentication.** iOS binaries use ARMv8.3 pointer authentication. Ghidra handles most of it, but some decompilers show raw `braa`/`blraa` instructions. IDA 9.x has better arm64e support than older versions.
- **dyld shared cache stripping.** Most Apple frameworks live in the cache, not as files. You must extract them with ipsw or a similar tool before Ghidra sees them.
- **Objective-C vs Swift naming.** Objective-C methods use `-[Class method]` selectors. Swift methods use mangled names that need `swift-demangle`. The LLM will confuse them if you do not demangle first.
- **FairPlay DRM.** App Store IPAs are encrypted. Static analysis fails until you dump from a jailbroken device.
- **Jailbreak detection.** Many apps check for jailbreak at runtime. Frida hooks must bypass these checks before you can instrument protected code. The ioskit frida scripts include `recon.js` and `ssl-bypass.js` for this.
- **Prompt injection via Mach-O strings.** Binary strings can contain text that looks like instructions to the LLM. The Ghidra CFStrings RCE (GHSA-mc3p-mq2p-xw6v) is fixed in Ghidra 12.0.3+. Update Ghidra. Treat decompiled output as untrusted data.
- **Hallucinated API names.** LLMs invent plausible-sounding Frida or ipsw flags. Always check `--help` before running a generated command.
- **Corellium and cloud devices.** Cloud iOS device support changes frequently. Whether specific iOS versions or device models are available is unverified. Check the provider's current documentation.

## See Also

- [Decompilation workflow](../05-tools/mcp-catalog.md)
- [Verification loop](../03-decomp/verification-loop.md)
- [Frida instrumentation](../06-topics/mobile-android-re.md)
- [Binary format overview](../05-tools/tool-catalog.md)
- [Skill writing guide](../05-tools/skills-catalog.md)
- [Security and isolation](../01-setup/agent-sandboxing.md)
