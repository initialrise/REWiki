# Managed and JIT Languages: .NET, Java, Go, Rust

> Tags: dotnet, csharp, java, go, rust, decompiler, deobfuscation, goresym, ilspycmd, vineflower, jadx | Difficulty: Intermediate | Prerequisites: command-line fluency, a decompiler or analysis tool (see `../03-decomp/decompile-workflow.md`), LLM-assisted rename basics (see `../03-decomp/batch-decompilation.md`)

## Overview

Managed and JIT-compiled languages sit between native binaries and scripts. Metadata preserves names, types, and file paths that native stripping removes. Decompilers recover near-source output. That makes .NET, Java, Go, and Rust the easiest targets for AI-assisted reverse engineering.

The four languages behave differently:

- **.NET (C#, F#, VB.NET)** compiles to Common Intermediate Language (IL). ILSpy, ilspycmd, and dnSpyEx decompile IL back to C#. Obfuscators such as ConfuserEx and .NET Reactor rename types and encrypt strings.
- **Java and Kotlin** compile to JVM bytecode, and Android apps carry Dalvik bytecode (dex). Vineflower, CFR, and jadx decompile bytecode to Java. ProGuard and R8 strip names on release builds.
- **Go** compiles to native code but embeds rich runtime metadata: function names, file paths, type information, and module data. GoReSym recovers this metadata even from stripped binaries.
- **Rust** compiles to native code with mangled symbol names and deep generics. Demangling is easy. Decompilation to readable Rust is hard. No mature Rust-source decompiler exists.

The AI workflow for all four is the same: run the language-specific metadata recovery tool first, feed the recovered names and types to the model, then use the decompiler output for logic. Use the model for what it is good at: renaming obfuscated identifiers and explaining logic.

## Setup

Install the command-line decompilers you need. Each tool is independent.

### .NET

ILSpy is the standard open-source .NET decompiler. The `ilspycmd` command-line tool ships inside the ILSpy repository.

```bash
# Requires the .NET SDK. ILSpy currently requires the .NET 11 SDK.
dotnet tool install -g ilspycmd
ilspycmd --version
```

The ILSpy README states that ILSpy is compatible only with the .NET 11.0 SDK. Source: https://github.com/icsharpcode/ILSpy

For interactive debugging and editing, use dnSpyEx. It is a fork of the archived dnSpy project. It provides a GUI with decompile, edit, and debug views. It runs on Windows and under Wine on Linux and macOS. Source: https://github.com/dnSpyEx-Project/dnSpy

JetBrains dotPeek is a free GUI decompiler. It is not scriptable. Use it as a second opinion, not as a pipeline stage.

dnlib is a .NET metadata read/write library. Use it for programmatic rename maps and obfuscator unpacking. Source: https://github.com/0xd4d/dnlib

### Java

Vineflower is the maintained fork of the Fernflower decompiler. It is the current default choice for Java bytecode. It requires Java 17 or newer for versions 1.11 and above. Source: https://github.com/Vineflower/vineflower

```bash
java -jar vineflower.jar target.jar out_dir/
```

CFR is a fast single-file Java decompiler. It is a good second opinion when Vineflower output looks wrong. Source: https://github.com/leibnitz27/cfr

```bash
java -jar cfr.jar target.jar --outputdir out_dir/
```

jadx handles both Java bytecode and Android dex files. It ships a GUI, a CLI, and a plugin API. Source: https://github.com/skylot/jadx

```bash
jadx -d out_dir/ target.apk
jadx-gui target.apk
```

For LLM integration, two jadx MCP projects exist and are actively maintained:

- `zinja-coder/jadx-ai-mcp` plus `zinja-coder/jadx-mcp-server` — a JADX plugin and an MCP server. Source: https://github.com/zinja-coder/jadx-ai-mcp
- `0xdad0/jadx-mcp` — an MCP server packaged as a jadx-gui plugin. Source: https://github.com/0xdad0/jadx-mcp

Procyon is effectively unmaintained. The last repository update was in 2022. Prefer Vineflower or CFR.

### Go

GoReSym is the primary Go metadata recovery tool. It is maintained by Mandiant. It recovers function names, file paths, type information, and module data from Go binaries. It works on stripped binaries because the Go runtime keeps its metadata in the `pclntab` and module data sections. Source: https://github.com/mandiant/GoReSym

```bash
go install github.com/mandiant/GoReSym/cmd/goresym@latest
# or download a prebuilt release from the Releases tab

./goresym -t -d -p target_binary > goresym.json
```

Flag meanings, from the GoReSym README:

- `-t` recovers type names.
- `-d` recovers standard and user package names.
- `-p` recovers file paths.
- `-j` writes JSON output. The README example shows JSON as the default output. Check `goresym -h` for the current flag spelling in your build.

The GoReSym repository also ships importer scripts for each major analysis tool:

- `IDAPython/goresym_rename.py` — reads the JSON and sets names in IDA Pro.
- `GhidraPython/goresym_rename.py` — the same for Ghidra.
- `BinjaPython/goresym_rename.py` — the same for Binary Ninja.

Community importers cover the remaining tools. Examples:

- `xusheng6/binja-GoReSym` — Binary Ninja plugin for the GoReSym JSON.
- `HanEmile/radare2-GoReSym` — radare2 script.
- `doomedraven/rz-goresym` — Rizin and rz-ghidra bridge.
- `Calastrophe/goresym-importer` — Binary Ninja plugin that validates the JSON before applying names.

### Rust

Rust demangling needs no special tool inside Ghidra. Ghidra has built-in Rust demangling since version 11. It handles both the legacy mangling scheme and the v0 scheme. The older GhidRust plugin is obsolete. Source: https://github.com/NationalSecurityAgency/ghidra

For CLI demangling, use rustfilt or the rustc-demangle library:

```bash
cargo install rustfilt
echo '_ZN3std2rt10lang_start17h...' | rustfilt
```

`rust-lang/rustc-demangle` is the upstream Rust demangling library. Source: https://github.com/rust-lang/rustc-demangle

For Python pipelines, `teambi0s/rust_demangler` and `saber0x0/Rust-Demangler-py` provide bindings. Both are community projects. Verify maintenance status before depending on them.

## Step-by-Step

### .NET workflow

1. Get the managed assembly. For a .NET single-file bundle or apphost executable, pass it to ilspycmd with `--bundle-entry` to select the embedded assembly.
2. Run a whole-project decompile.

   ```bash
   ilspycmd -p -o out_dir/ --referencepath deps_dir/ target.dll
   ```

   `-p` writes one `.cs` file per type plus a project file. This layout is ideal for feeding to an LLM: each file is one type.

3. Inspect metadata when names look wrong. `ilspycmd --dump-table TypeDef --json target.dll` prints metadata table rows as JSON. Useful tables: `TypeDef`, `Method`, `Property`, `Field`, `AssemblyRef`, `ManifestResource`.
4. Identify the obfuscator. Run DIE, `strings`, or de4dot detection on the assembly. ConfuserEx leaves recognizable patterns. .NET Reactor and Eazfuscator leave different ones.
5. Deobfuscate before deep analysis. See the deobfuscation section below.
6. Feed the decompiled tree to the model in chunks. One type per prompt works better than the whole assembly at once.
7. Validate any renames by recompiling the project or by checking IL with `ilspycmd -il`.

Useful ilspycmd flags (verified against `IlspyCmdProgram.cs` in the ILSpy repository):

| Flag | Purpose |
|---|---|
| `-p` | Whole-project decompile to a directory |
| `-o` | Output directory |
| `-t` | Decompile a single named type |
| `-m` | Decompile a single member by doc ID or metadata token |
| `-il` | Show raw IL instead of C# |
| `--dump-table` | Dump a metadata table, with `--json` for machine-readable output |
| `-r` | Add a reference path for dependency resolution |
| `--use-varnames-from-pdb` | Use local variable names from a matching PDB |

### Java workflow

1. Determine the artifact type. A `.jar`, `.class`, or `.war` is JVM bytecode. An `.apk`, `.dex`, or `.aab` contains dex bytecode. jadx handles both.
2. Decompile with Vineflower for JVM artifacts.

   ```bash
   java -jar vineflower.jar target.jar out_dir/
   java -jar cfr.jar target.jar --outputdir out_dir2/   # second opinion
   ```

3. Decompile APKs with jadx.

   ```bash
   jadx -d out_dir/ target.apk
   ```

4. Check for name obfuscation. ProGuard and R8 produce short names like `a.a.a` and `b()`. String encryption and control-flow flattening are also common.
5. Recover names where possible. See the name-recovery section below.
6. Feed decompiled packages to the model. Package and class structure helps the model infer intent.
7. For dynamic verification, use jadx-mcp so the agent can query the decompiler through MCP instead of dumping files.

### Go workflow

1. Identify the binary as Go. Look for the `Go build ID` string or run `file` and `strings`. GoReSym also fails cleanly on non-Go binaries.
2. Run GoReSym.

   ```bash
   ./goresym -t -d -p target_binary > goresym.json
   ```

3. Load the JSON into your analysis tool. Use the bundled importer for IDA, Ghidra, or Binary Ninja. For radare2 or Rizin use the community script.
4. Read the build info in the JSON: Go version, module path, dependencies, architecture, build ID. This tells you the exact Go version the binary was compiled with, which matters for runtime structure offsets.
5. Decompile functions with Ghidra, IDA, or Binary Ninja. The recovered names make the pseudo-C readable.
6. For obfuscated Go binaries where symbols were deliberately stripped or mangled, run a CFG-similarity tool such as `volexity/GoResolver`. It matches function control-flow graphs against known Go runtime functions to recover names. Feed its output to the model as rename candidates.

Go has no mature decompiler that produces Go source. Expect pseudo-C. The model's job is to map pseudo-C back to Go idioms: slices, channels, goroutines, defer, interface calls.

### Rust workflow

1. Load the binary in Ghidra 12 or IDA 9.5. Ghidra demangles Rust symbols automatically since version 11.
2. Confirm demangling worked. Function names should look like `std::rt::lang_start::h...` instead of `_ZN...`.
3. Identify the crate structure. Rust binaries embed panic messages with source file paths like `src/main.rs:42`. Strings reveal crate names and module paths.
4. Decompile with the tool's default decompiler. Rust pseudo-C is the hardest of the four languages: generics monomorphize into many copies, panic machinery adds noise, and `core::` intrinsics obscure control flow.
5. Feed functions to the model with context: demangled name, strings referenced, callers and callees. Ask for a Rust-level explanation, not C-level.
6. For bulk renaming, generate a rename map and apply it through the tool's API or a script.

## AI Assists

The model helps most where metadata is missing or misleading. These patterns work across all four languages.

### Deobfuscation mapping (.NET)

Obfuscators replace meaningful names with `A`, `B`, `Class1`. The model can propose better names from context.

Workflow:

1. Decompile the obfuscated assembly with ilspycmd.
2. For each suspicious type, collect evidence: string literals used, called methods, fields accessed, base types.
3. Prompt the model:

   ```
   This C# type was decompiled from an obfuscated .NET assembly.
   Original names were stripped. Propose meaningful names for the type,
   its methods, and its fields based on the code below.
   Output a rename map as JSON: {"type": "...", "methods": {...}, "fields": {...}}
   ```

4. Apply the rename map with dnlib or dnSpyEx. Keep a backup of the original assembly.
5. Verify by recompiling or by diffing IL before and after.

For ConfuserEx specifically, string decryption often happens at runtime. Deobfuscate strings first, then rerun the name-inference pass on the decrypted output.

### Deobfuscation mapping (Java)

ProGuard and R8 remove the `mapping.txt` file from shipped artifacts. Name recovery is inferential.

Techniques, from cheap to expensive:

1. **Dictionary attack.** Match method signatures and constant usage against common Android/Java library fingerprints. Tools and scripts for this exist in the jadx plugin ecosystem. Quality varies.
2. **LLM rename pass.** Feed the decompiled class with its string constants and call sites. Ask for a name and a one-line purpose.
3. **Cross-reference clustering.** Group classes that call each other. The model can often name a cluster ("network layer", "UI adapter") even when individual names stay generic.

```bash
# Example: decompile one package, then ask the model to name it
jadx -d out/ --show-bad-code target.apk
```

### Name recovery (Go)

Go binaries keep more metadata than most people expect. GoReSym recovers most names automatically. The model adds value in three places:

1. **Renamed or stripped builds.** Some Go binaries are post-processed to corrupt `pclntab`. GoReSym may recover partial data. Feed what it finds plus CFG-similarity results from GoResolver to the model. Ask it to pick the most plausible name per function.
2. **Interface satisfaction.** Go interface calls dispatch through `itab` structures. The model can map an `itab` to the concrete type by matching method signatures.
3. **Vendor package identification.** The module path and dependency list in the JSON often identify the software. Ask the model to recognize the project and recall its public API names.

### Rename inference (all languages)

A generic prompt template that works for .NET, Java, and Rust:

```
Decompiled function from a <language> binary.
Symbol: <mangled or obfuscated name>
Strings referenced: <list>
Called functions: <list>
Called by: <list>

Propose:
1. A meaningful function name (snake_case or camelCase per language convention)
2. A one-sentence description of what it does
3. Confidence: high / medium / low

Rules:
- Do not invent behavior not supported by the code.
- If strings suggest a library call, name it as a wrapper.
- If the function is a thunk or PLT-style forwarder, say so.
```

Batch this per function. Apply high-confidence renames automatically. Review medium and low confidence manually.

### What the model should not do

- Do not let the model write comments directly into your analysis database during untrusted-binary sessions. Strings inside binaries can carry prompt-injection payloads. See `../01-setup/agent-sandboxing.md` (planned) and `../07-advanced/` for isolation guidance.
- Do not trust LLM-proposed deobfuscation without verification. Recompile .NET/Java output or diff IL/bytecode before and after renames.
- Do not feed the entire decompiled tree to a single prompt. Context windows are large but attention degrades. Chunk by type or package.

## Pitfalls

- **.NET obfuscators evolve faster than de4dot.** The original `de4dot/de4dot` repository is archived. `ViRb3/de4dot-cex` is also archived. Many ConfuserEx forks and .NET Reactor versions are not covered. For modern obfuscators, plan on manual unpacking: run the binary, let anti-tamper initialize, dump from memory with dnSpyEx or a debugger, then decompile the dump.
- **Java name recovery is probabilistic.** Without `mapping.txt`, recovered names are guesses. Treat them as labels for navigation, not ground truth.
- **GoReSym version drift.** GoReSym tracks Go runtime internals. If the binary uses a very new or very old Go version, some metadata may fail to parse. Check the `Version` and `TabMeta.Version` fields in the JSON.
- **Go binaries can be post-processed.** UPX, garble, and custom packers break GoReSym's assumptions. Run `goresym` first. If it fails, unpack before retrying.
- **Rust pseudo-C is verbose.** Generics produce many similar functions. The model may merge them incorrectly. Keep function boundaries strict.
- **PDB files leak names.** If a `.pdb` sits next to a .NET assembly, ilspycmd can use it for variable names. In real targets, PDBs are usually absent. Do not assume they exist.
- **Single-file .NET bundles hide assemblies.** Use `ilspycmd --bundle-entry` or extract the bundle first. Feeding the apphost executable without this flag gives poor results.
- **Kotlin metadata matters.** jadx and Vineflower handle Kotlin bytecode, but Kotlin-specific metadata (`@Metadata` annotations) carries nullability and coroutine info that pure Java decompilers lose. jadx preserves more of it.
- **AI rename maps can break builds.** A rename that collides with an existing member or changes a public API signature breaks compilation. Always verify after applying.

## See Also

- `../03-decomp/decompile-workflow.md` — general decompiler workflow
- `../03-decomp/batch-decompilation.md` — bulk decompilation pipelines
- `../03-decomp/verification-loop.md` — verifying decompiler and LLM output
- `../05-tools/mcp-catalog.md` — using Ghidra MCP servers with agents
- `../05-tools/mcp-catalog.md` — MCP server landscape
- `../01-setup/agent-sandboxing.md` — isolating agents from untrusted binaries
