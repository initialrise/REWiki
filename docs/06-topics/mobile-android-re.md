# Android Reverse Engineering with AI

> Tags: android, apk, jadx, apktool, smali, frida, dexdec, unpacking, ghidra | Difficulty: Intermediate | Prerequisites: Java/Kotlin basics, Linux CLI, adb, rooted device or emulator for dynamic work

Android reverse engineering in 2026 splits cleanly into two halves. Static work reads the DEX bytecode back as Java or Kotlin. Dynamic work runs Frida on a rooted device. AI fits both halves. LLMs are strong at naming obfuscated classes, writing Frida hook scripts, and explaining decompiled control flow. They are weak at bytecode-level verification and at judging whether a hook actually fired. Pair the model with headless decompilers and Frida MCP servers and you get a usable pipeline.

## Overview

The Android RE workflow has four stages:

1. **Unpacking.** Many apps ship packed. The real DEX never sits in the APK as a readable file. You must extract it from memory or from the packer's own loader.
2. **Static decompilation.** Run jadx, dexdec, or an MCP front-end over the APK or DEX.
3. **Name recovery.** R8 and ProGuard strip identifiers. Kotlin metadata and resource names leak back some of the original names.
4. **Dynamic instrumentation.** Frida hooks on a rooted device watch runtime behavior and bypass anti-analysis.

AI tooling covers each stage. jadx-mcp and dexdec give agents direct access to decompiled source. kahlo-mcp, frida-c2-mcp, and mcp-termux give agents Frida control. Exuvia and MobileRE-Skill package the unpacking and skill workflows. No single tool does the whole job. The value is in chaining them.

## Setup

### Required tools

| Tool | Install | Purpose |
|---|---|---|
| jadx | `brew install jadx` or github.com/skylot/jadx release zip | DEX to Java decompiler. CLI plus GUI |
| apktool | `brew install apktool` or bitbucket iBotPeaches | APK to smali plus resources. Rebuild with `apktool b` |
| JDK 17+ | package manager | Required by jadx and the headless MCP servers |
| Android SDK platform-tools | developer.android.com | `adb`, `fastboot` |
| Frida | `pip install frida-tools` | Runtime instrumentation |
| Ghidra | ghidra-sre.org 12.x | Native `.so` analysis inside `lib/arm64-v8a` |
| Python 3.11+ | python.org | Glue scripts and MCP adapters |

On a rooted device you also need `frida-server` matching your `frida` version. Push it and run it as root:

```bash
adb push frida-server /data/local/tmp/
adb shell "su -c 'chmod 755 /data/local/tmp/frida-server'"
adb shell "su -c '/data/local/tmp/frida-server &'"
adb shell "su -c 'frida-ps -U'"   # sanity check: lists processes
```

### Headless JADX MCP servers

Several projects expose `jadx-core` to MCP clients without the GUI. Pick one and wire it into your agent config.

| Server | Repo | Notes |
|---|---|---|
| jadx-headless-mcp | github.com/1013503897/jadx-headless-mcp | ~26 tools over stdio. Java source plus smali fallback. `load_apk`, `get_class_source`, xrefs. JDK 17+ |
| jadx-mcp-server | github.com/zinja-coder/jadx-mcp-server | FastMCP adapter for the JADX-AI plugin. ~34 tools |
| jadx-ai-mcp | github.com/zinja-coder/jadx-ai-mcp | JADX GUI plugin plus Python MCP bridge. Rename, xref, comment tools |
| revoid | github.com/samudoria/revoid | Headless jadx-core MCP plus a call-graph index |
| dexdec | github.com/asLody/dexdec | Rust decompiler workbench. CLI plus live MCP. Claims higher fidelity than jadx on obfuscated code |
| delamain | github.com/xjoker/delamain | Production-oriented headless JADX MCP. Docker, bearer auth |

Example `claude_desktop_config.json` or `~/.claude.json` entry for a stdio server:

```json
{
  "mcpServers": {
    "jadx": {
      "command": "/path/to/jadx-headless-mcp",
      "args": []
    }
  }
}
```

Then in the agent session, load the APK through the tool:

```text
load_apk("/path/to/target.apk")
get_app_info()
search_classes_by_keyword("crypto")
get_class_source("com.example.LoginActivity")
```

jadx-headless-mcp auto-falls back to smali when jadx fails on an anti-decompile stub. Watch for the marker `// [jadx java-decompile failed → smali]` in returned source. It means the Java view is broken for that class. Read the smali.

### dexdec

DexDec is a Rust workbench for APK and DEX files. It claims higher-fidelity output than jadx on heavily obfuscated apps and keeps decompiling classes that crash older tools. It ships a CLI and a Tauri desktop app with MCP support.

```bash
cargo build --release -p dexdec
./target/release/dexdec inspect app.apk
./target/release/dexdec decompile app.apk --class com.example.MainActivity --language java
./target/release/dexdec decompile app.apk --output-dir decompiled
./target/release/dexdec resources read app.apk AndroidManifest.xml
```

The MCP interface is exposed by the desktop app under Settings > MCP. You pick the client and it writes the config. The agent can then search symbols, decompile on demand, and follow references inside the open project. The CLI is the fallback when you want batch or CI use.

### apktool and smali

apktool decodes the APK to a directory of smali files plus decoded resources. Use it when you need to see what jadx hides: manifest surgery, resource obfuscation, native library layout, or rebuilding a modified APK.

```bash
apktool d target.apk -o target_apktool
# decoded tree: AndroidManifest.xml, res/, smali/, lib/, assets/

# Edit smali files under smali*/ then rebuild
apktool b target_apktool -o target_patched.apk
```

Sign the rebuilt APK before install:

```bash
apksigner sign --ks debug.keystore target_patched.apk
```

Or use `uber-apk-signer` for a one-command sign plus zipalign. For smali-level edits, check out `baksmali`/`smali` directly. apktool already bundles them. The `smali-lsp` extension in VS Code gives you jump-to-definition inside smali files.

## How It Works

### End-to-end static pipeline

```text
APK
 ├─ apktool d          → smali + resources + manifest
 ├─ jadx / dexdec      → Java/Kotlin source
 ├─ recover-kotlin-names.sh → mapping.tsv of obfuscated → real names
 └─ unzip lib/arm64-v8a/*.so → Ghidra for native code
```

Start with triage, not full decompilation. Big APKs take minutes to decompile. Get the manifest and the class list first.

```bash
# Quick manifest read without a full decompile
apktool d -s -f target.apk -o triage   # -s skips dex → sources
cat triage/AndroidManifest.xml

# Or through the MCP
get_android_manifest()
get_app_info()
```

Then decompile selectively. The agent should ask for specific classes, not "decompile everything". Large apps produce thousands of classes and the context window dies.

```text
search_classes_by_keyword("Auth")
get_class_source("com.example.auth.TokenManager")
get_xrefs_to_method("com.example.auth.TokenManager", "refresh")
```

### Name recovery with R8 and Kotlin metadata

R8 renames JVM symbols to `a.b.c`. It cannot strip Kotlin metadata strings because the Kotlin runtime needs them for reflection and coroutines. Two annotations leak original names:

- `@DebugMetadata` on coroutine classes carries the original FQN in the `c` field.
- `@Metadata.d2` on every Kotlin class lists internal class refs in JVM descriptor form.

The skill at github.com/SimoneAvogadro/android-reverse-engineering-skill ships `recover-kotlin-names.sh` which mines both annotations from a decompiled sources tree.

```bash
bash scripts/recover-kotlin-names.sh output/sources/ output/names/
# produces mapping.tsv: obf_fqn  real_fqn  file

bash scripts/lookup-name.sh output/names/ -o ab.cd
# returns the recovered real name
```

Reported recovery rates from that skill: about 30 to 50 percent of all classes, but near 100 percent of the classes you actually want to read — repositories, view models, use cases, DTOs. Pure-Java helper classes do not carry Kotlin metadata and stay obfuscated.

`jadx --deobf` helps but is not enough. It renames by heuristic, not by metadata. The metadata approach is deterministic. Use it first, then `--deobf` for the leftovers.

### Native `.so` analysis with Ghidra

Android apps split logic across Java and native code. JNI bridges live in `lib/arm64-v8a/*.so`. The workflow:

1. Find the `.so` files in the APK.
2. Find which Java methods declare `native`.
3. Match Java `native` signatures to exported JNI symbols in the `.so`.
4. Decompile the `.so` in Ghidra.
5. Feed the pseudocode plus the Java call site to the LLM.

```bash
unzip target.apk -d target_unpacked
ls target_unpacked/lib/arm64-v8a/

# JNI exports follow Java_com_package_Class_method
nm -D target_unpacked/lib/arm64-v8a/libtarget.so | grep Java_
# or in Ghidra: search symbols for "Java_"
```

For stripped libraries there are no `Java_` exports. Look for `JNI_OnLoad` and `RegisterNatives` calls. The function table passed to `RegisterNatives` maps method names to function pointers. The MobileRE-Skill repo documents this pattern.

In Ghidra, load the `.so` as ARM64 little-endian. Apply the `JNI` function signature if Ghidra does not detect it automatically. Then ask the agent:

```text
This .so exports JNI_OnLoad. Find the RegisterNatives call inside it.
List each registered method name and its function pointer address.
Decompile the function at 0x00012340 and explain what it computes.
```

Cross-check the LLM's claimed function addresses against `nm -D` output or Ghidra's symbol list. LLMs hallucinate addresses.

### Frida on-device MCP servers

Three MCP servers give agents Frida control on a rooted Android device.

#### kahlo-mcp

Repo: github.com/FuzzySecurity/kahlo-mcp. The most complete Frida MCP found. It manages the full session lifecycle: device discovery, attach or spawn, job execution, event streaming, module store.

Setup: edit `kahlo-mcp/config.json`, set `adbPath` to your adb binary, `npm install && npm run build`. Register `dist/index.js` as a stdio MCP server in your agent config. Push a `frida-server` matching the version in `kahlo-mcp/package.json` to the device and run it as root.

Key tools:

- `kahlo_devices_list`, `kahlo_devices_health` — device readiness.
- `kahlo_processes_list` — find the process name before attach.
- `kahlo_targets_ensure` — attach or spawn with optional gating.
- `kahlo_jobs_start` — run an isolated Frida script. Accepts inline JS source for fast iteration.
- `kahlo_events_fetch` — poll structured events with cursor pagination.
- `kahlo_modules_*` — versioned module store for reusable hooks.

The stdlib inside kahlo-mcp provides Java object inspection, stack traces, Intent parsing, and method hooking helpers. Call `kahlo_mcp_about` from the agent to get the full contract.

Workflow:

```text
kahlo_devices_list()
kahlo_processes_list(device_id)          # find target process name
kahlo_targets_ensure(device_id, package="com.example.app", mode="spawn")
kahlo_jobs_start(target_id, module={kind:"source", source:"Java.perform(() => { ... })"})
kahlo_events_fetch(target_id)
```

#### frida-c2-mcp

Repo: github.com/s4dp4nd4/frida-c2-mcp. Runs the entire Frida stack on-device inside Termux. Exposes a streamable HTTP MCP endpoint. No client-side Frida install needed.

Setup on a rooted Android device with Termux:

```bash
# inside Termux on the device
pip install -r requirements-android.txt
python cli.py   # starts the MCP server on port 6767
```

Then register the remote endpoint in your agent:

```bash
gemini mcp add --transport http frida-c2-mcp http://<DEVICE_IP>:6767/mcp
```

For Claude Code or Codex, add an HTTP MCP server entry pointing at `http://<DEVICE_IP>:6767/mcp`. The server supports process listing, app start/stop, attach sessions, and inline script execution. Scripts are bundled on-device with `esbuild` because `frida-compile` crashes under Android's SELinux W^X policy. It targets Frida 17+.

The project is a proof of concept. It has no authentication and no TLS. Run it only on a trusted LAN or VPN. Do not expose it to the internet.

#### mcp-termux

Repo: github.com/PhoenixHairpin/mcp-termux. A 73-tool on-device Android RE MCP server. It bundles stackplz (eBPF tracing), paradise (kernel memory read/write), and radare2 6.1.0 for aarch64. Runs as root on Android 12+ kernels. Documentation is in Chinese.

This is heavier than frida-c2-mcp. It gives the agent syscall tracing, uprobe hooks, hardware breakpoints, memory scanning, ARM64 disassembly, and pseudo-C decompilation on-device. Use it when Frida alone is not enough — for example when a packer detects Frida or when you need kernel-level memory access.

```bash
tar xzf mcp_re_v7.tar.gz -C /data/adb/
su -c "cd /data/adb/mcp_re_v6 && nohup ./mcp -p 65534 </dev/null >./mcp.log 2>&1 &"
```

MCP endpoint: `http://127.0.0.1:65534/mcp` over Streamable HTTP. Port 65533 runs a bootstrap MCP.

The tool list includes `trace_syscall`, `trace_uprobe`, `trace_offset`, `mem_maps`, `mem_read`, `mem_write`, `mem_asm_write`, `mem_scan`, `mem_disasm`, `r2_decompile`, and more. The kernel modules under `kmodules/` auto-load by kernel version at startup.

### APK unpacking

Many apps use packers that encrypt the real DEX and load it at runtime. Static decompilation sees only the shell. Two tools address this.

#### Exuvia

Repo: github.com/Huai-Tian/Exuvia. A deterministic unpacking and repair pipeline built for AI agents. It never calls an LLM itself. It produces a structured handoff — `REPORT.json`, `debt.json`, evidence slices — and outsources only the genuinely hard crypto work to an external model through a four-gate merge.

```bash
cargo build --release

# Static dissection: zero tokens
./exuvia packed.apk

# Repair a dumped DEX back into a runnable APK
./exuvia repair packed.apk dumped.dex -o restored.apk
```

The repair path handles dex triage, class cleaning, deweaving, method-body restoration, manifest surgery, zipalign, and v2 signing. The static path identifies encrypted payloads mechanically, locates candidate decrypt routines through `JNI_OnLoad` and `.init_array`, and emits work packages for an external LLM. Verdicts happen in Rust, not in the model.

This is the most principled unpacking tool found. It treats the LLM as an untrusted oracle and verifies every claim against byte-level tests. No release binaries yet — build from source.

#### MobileRE-Skill

Repo: github.com/index-login/MobileRE-Skill. A complete skill system for mobile RE agents. 25 Frida modules, an unpacking pipeline, memory DEX dump with dual-dumper cross-validation, anti-detection bypass, and a dex-to-C handoff for Ghidra. Written for the Kilo agent but the SKILL.md files and scripts port to any agent.

The unpacking flow uses `unpack.py`, a six-step pipeline: backfill, supplementary scan, auto-pull, checksum repair, dedup, method-body marking. For memory dumping it ships `panda` and `mem` dumpers that avoid ptrace to stay hidden from anti-debug. The dex-to-C path feeds recovered DEX into Ghidra for deeper analysis when Java-level decompilation is not enough.

### Rooted emulator setup

Physical devices work but emulators are faster to reset and easier to snapshot.

#### Android Virtual Device (AVD)

```bash
# Create a Pixel 7 AVD with Android 14
avdmanager create avd -n pixel7 -k "system-images;android-34;google_apis;x86_64"

# Root it: use a userdebug or eng build, or run
adb root   # works on userdebug builds and emulators
```

AVD images from Google are `user` builds by default. `adb root` fails on them. Use the `-userdebug` tagged system images or Genymotion's rooted images. For ARM translation on x86 hosts, pick an API level with ARM-to-x86 translation or use an ARM64 host.

#### Genymotion

Genymotion ships rooted Android images out of the box. Install Genymotion Desktop or the command-line tools, create a device, and `adb connect` to it. Frida-server runs as root without extra steps. ARM translation is available through Genymotion's `ARM Translation` package for x86 hosts.

#### Physical device alternative

A used Pixel with a factory-unlocked bootloader is the most reliable physical target. Flash a `userdebug` factory image, or root with Magisk. Frida-server runs through `su`.

Whichever target you pick, verify Frida works before pointing the agent at it:

```bash
frida-ps -U | head
# or for a remote emulator
frida-ps -H <device_ip>:27042 | head
```

## Step-by-Step

### Decompile an APK with jadx headless

```bash
# CLI one-shot
jadx -d output/ target.apk

# Or through MCP
load_apk("/path/target.apk")
get_class_source("com.example.MainActivity")
```

For large apps, use `--show-bad-code` and threads. jadx CLI options:

```bash
jadx -d out/ --threads-count 8 --deobf target.apk
```

`--deobf` assigns readable names where metadata is absent. It is a fallback, not a replacement for Kotlin metadata recovery.

### Write a Frida hook through the agent

Give the agent the Java method signature and the class name. The kahlo-mcp stdlib or a plain Frida script both work.

```javascript
Java.perform(function () {
  var TokenManager = Java.use("com.example.auth.TokenManager");
  TokenManager.refresh.implementation = function () {
    var result = this.refresh();
    console.log("[+] TokenManager.refresh -> " + result);
    return result;
  };
});
```

Through kahlo-mcp:

```text
kahlo_jobs_start(target_id, module={kind:"source", source:"<the JS above>"})
```

The agent can iterate: read the event stream, adjust the hook, rerun. This is faster than writing scripts by hand for one-off hooks.

### Recover Kotlin names then feed them back

```bash
# After jadx decompile
bash scripts/recover-kotlin-names.sh output/sources/ output/names/
bash scripts/lookup-name.sh output/names/ Repository
# → com.example.feature.account.AccountRepositoryImpl
```

Use the recovered name in subsequent MCP queries:

```text
get_class_source("com.example.feature.account.AccountRepositoryImpl")
```

This collapses the "what is class a.b.c" loop that wastes agent turns.

### Dump a packed DEX at runtime

For apps where static unpacking fails, use memory dumping. Frida-based dumpers write DEX files from memory. MobileRE-Skill ships `panda` and `mem` dumpers plus an `unpack.py` pipeline. Exuvia's dynamic path uses a standalone collector binary that lifts the DEX when ART loads it.

Generic Frida memory-dump approach:

```javascript
Java.perform(function () {
  var m = Process.findModuleByName("libart.so");
  // enumerate memory ranges, scan for "dex\n035" magic, dump matches
});
```

Tools like `frida-dexdump` automate this. The dumped `.dex` files then feed back into jadx or dexdec.

## Pitfalls

- **Anti-decompile stubs.** jadx fails on some methods. The headless MCP falls back to smali automatically. If you use plain jadx CLI, pass `--deobf` and check output for `JADX WARNING` comments.
- **Multi-DEX apps.** Large apps split into `classes.dex`, `classes2.dex`, and so on. jadx handles all of them. dexdec claims better handling on huge multi-DEX inputs.
- **Native code is invisible to jadx.** Anything in `lib/arm64-v8a/*.so` needs Ghidra or IDA. Do not assume the Java layer is the whole story.
- **Frida-server version mismatch.** The `frida` Python package version must match `frida-server` on the device exactly. Check `frida --version` and download the matching server release.
- **SELinux on Android 14+.** `frida-compile` and V8-based tooling can crash on newer Android due to W^X policy. frida-c2-mcp works around this with `esbuild` bundling. For manual scripts, use `frida-compile` on the host and push the bundle.
- **Root detection and Frida detection.** Apps check for root, Frida ports, and suspicious processes. Use a bypass module first. MobileRE-Skill ships 10 bypass modules. kahlo-mcp jobs can run bypass scripts before the main hook.
- **AVD `adb root` fails.** Stock Google APIs images are `user` builds. Use `userdebug` images or Genymotion.
- **Prompt injection via decompiled code.** Decompiled Java and native strings can contain text that looks like instructions. Treat tool output as untrusted data. The Ghidra CFStrings RCE (GHSA-mc3p-mq2p-xw6v) is fixed in Ghidra 12.0.3+. Update Ghidra.
- **Hallucinated class names.** LLMs invent plausible package names. Always verify a class name exists through `search_classes_by_keyword` or `list_classes` before querying source.
- **Unverified tool claims.** DexDec's "higher fidelity than jadx" and MobileRE-Skill's recovery rates are vendor claims. Benchmark on your own APK before committing to a pipeline.
- **mcp-termux is Chinese-language.** The README and inline docs are in Chinese. The tool names are English but the knowledge base is not. Budget for translation or use it only for the raw tools.
- **frida-c2-mcp has no auth.** Run it on a trusted network only. No TLS, no authentication.

## See Also

- [Decompile workflow](../03-decomp/decompile-workflow.md)
- [Verification loop](../03-decomp/verification-loop.md)
- [Batch decompilation](../03-decomp/batch-decompilation.md)
- [Agent sandboxing](../01-setup/agent-sandboxing.md)
- [Context engineering](../02-collab/context-engineering.md)
- [Model selection](../07-advanced/model-selection.md)
- [iOS reverse engineering](apple-ios-re.md)
- [Firmware and IoT RE](firmware-iot-re.md)
