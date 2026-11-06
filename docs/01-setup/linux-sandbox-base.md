# The Base Linux RE Sandbox

> Tags: setup, sandbox, isolation, linux, vagrant, docker, ufw | Difficulty: beginner | Prerequisites: basic Linux administration, a hypervisor or Docker host, an LLM agent CLI you intend to run against it (Claude Code, Codex CLI, Kimi Code)

---

## Overview

The base Linux RE sandbox is the layer-0 asset of every AI-assisted reverse engineering setup. It is a disposable Ubuntu or Debian environment that holds the full static and dynamic analysis toolchain. An LLM agent runs against it. It analyzes binaries, decompiles firmware, and writes Frida scripts.

Why build it before you add AI:

- Isolation is mandatory. Feeding untrusted binaries to an LLM agent is a documented attack surface. Prompt-injection strings survive compilation into `.rodata`. They reach the model through decompiler output and string dumps. See the prompt-injection findings in section 11 of the research report (`arXiv 2605.30667`, Check Point's "Skynet" sample, the CAIRN A3 malware families).
- The agent should never touch your host. A dedicated sandbox user with no sudo, a firewalled egress path, and snapshot/clone workflow give you a reset button.
- One environment removes setup friction. The script below installs the whole toolchain once. You clone it per target.

Two deployment shapes are covered:

| Shape | When to use | Notes |
|---|---|---|
| Full VM (QEMU/KVM or VirtualBox) | Malware analysis, Windows-target work under Wine, x64dbg, anything that must not share your kernel | Strongest isolation. Snapshot via `virsh snapshot-create-as`. Slower to clone |
| Container (Docker) | Static analysis only. Ghidra headless, JADX, capa, binwalk, LLM scripting | Faster clones. Shared kernel. Never run a suspicious binary directly on the host Docker daemon |

The recommended default is a VM for dynamic work and a container for bulk static triage.

---

## Setup

### Package list

Install every tool below. Versions marked "verified" were checked against upstream release tags on 2026-11-05. Versions marked "unpinned" move fast. Check upstream before scripting upgrades.

| Tool | Purpose | Install method | Version observed |
|---|---|---|---|
| Ghidra | Decompilation, headless analysis, MCP target | GitHub release ZIP | 12.2 verified |
| JDK 21 | Ghidra runtime | `openjdk-21-jdk-headless` | Ubuntu 24.04/25.x default |
| Python 3 | Scripting, pip tools | `python3`, `python3-pip`, `python3-venv` | distro default |
| radare2 or rizin | CLI disassembly, scripting, gdb-compatible server | distro package or GitHub release | rizin 0.9.1, radare2 6.2.4 verified |
| Frida | Dynamic instrumentation | pip `frida-tools` plus matching `frida` release | 17.25.2 verified |
| x64dbg under Wine | Windows debugging of PE targets | WineHQ packages | Wine 10.x series current, unverified pin |
| jadx | APK/DEX decompilation | GitHub release ZIP | 1.5.6 verified |
| apktool | APK resource decode, smali work | GitHub release JAR | 3.0.3 verified |
| binwalk | Firmware carving, signature scan | pip or GitHub release | 3.1.0 verified |
| capa | Capability detection (Mandiant rules) | pip `flare-capa` | 10.0.0 verified |
| floss | Obfuscated string deobfuscation | pip `flare-floss` | unverified, moves with release tags |
| upx | Packer detection/unpacking | distro package | 5.3.0 verified |
| binutils | `objdump`, `readelf`, `nm`, `strings` | distro package | distro default |
| gdb + gef or pwndbg | Debugging with modern UI | distro gdb plus plugin scripts | distro default |
| strace, ltrace | Syscall and library-call tracing | distro package | distro default |
| tcpdump, tshark/wireshark | Packet capture | distro package | distro default |
| mitmproxy | HTTP/HTTPS interception | pip or distro package | 12.3.1 verified |
| Docker | Container side of the workflow | Docker official repo | current stable |
| Ollama | Local model inference for air-gapped analysis | upstream install script | current, unverified pin |

Sources: [Ghidra releases](https://github.com/NationalSecurityAgency/ghidra/releases), [bethington/ghidra-mcp](https://github.com/bethington/ghidra-mcp), [frida/frida](https://github.com/frida/frida), [skylot/jadx](https://github.com/skylot/jadx), [iBotPeaches/Apktool](https://github.com/iBotPeaches/Apktool), [mandiant/capa](https://github.com/mandiant/capa), [mitmproxy/mitmproxy](https://github.com/mitmproxy/mitmproxy), [upx/upx](https://github.com/upx/upx), [ReFirmLabs/binwalk](https://github.com/ReFirmLabs/binwalk), [rizinorg/rizin](https://github.com/rizinorg/rizin), [radareorg/radare2](https://github.com/radareorg/radare2).

### Directory layout convention

Use a fixed layout under `/work`. Every script, note, and finding lands in a predictable place. This matters for the agent too: a flat directory confuses it. A typed directory tree lets skills route correctly.

```
/work/
├── targets/        # Untrusted binaries, firmware images, APKs. NEVER execute without care.
├── analysis/       # Ghidra projects, JADX output, decompiler exports, notes
├── evidence/       # Verified findings: addresses, offsets, hashes, screenshots, packet captures
├── scratch/        # Disposable work: extracted archives, patched copies, build output
└── scripts/        # Your helper scripts and agent skills
```

Rules:

- `targets/` is read-only in practice. Do not write into it. Copy into `scratch/` first.
- `evidence/` is the only directory that feeds reports. Everything here must be reproducible.
- `analysis/` holds tool databases. They are large and regenerable.

### User separation

Run two users:

| User | Role | Privileges |
|---|---|---|
| `re` | Analysis user. Owns `/work`. Runs Ghidra, radare2, gdb, the agent CLI | No sudo. Docker group membership is acceptable only if you accept the docker-is-root caveat |
| `agent` | Optional: dedicated user that runs the LLM agent CLI only | No sudo. Can read `/work` and `scripts/`. Cannot write to `targets/` or `evidence/` if you want strict separation |

Simpler alternative that most setups use: one `re` user, no sudo, agent runs as that user. The key property is no passwordless sudo for the account the agent controls.

The agent CLI authenticates with API keys stored in `~/.config/` of that user. Do not put production credentials anywhere in the VM. See the mitigations in section 11.4 of the research report.

### Snapshot and clone workflow

VM (libvirt example):

```bash
# Create the golden image once.
virsh snapshot-create-as re-sandbox golden --description "clean toolchain"

# Before each new target.
virsh snapshot-revert re-sandbox golden

# Or clone the whole VM for parallelism.
virt-clone --original re-sandbox --name re-target-001 --auto-clone
```

Container (Docker example):

```bash
# Build the image once.
docker build -t re-sandbox .

# Run a fresh container per target.
docker run --rm -it --network re-net \
  -v /srv/targets:/work/targets:ro \
  -v /srv/analysis:/work/analysis \
  re-sandbox bash
```

Reset contract: a target analysis session ends when the container or VM reverts. If a binary wrote state you need, it should have been copied to `evidence/` first.

### Firewall defaults

Default posture: deny inbound, deny outbound except an allowlist.

```bash
sudo ufw default deny incoming
sudo ufw default deny outgoing
sudo ufw allow out to any port 443 proto tcp comment "HTTPS: package repos, LLM API"
sudo ufw allow out to any port 53 proto udp comment "DNS"
sudo ufw allow out to 192.168.1.1 port 53 proto udp comment "LAN DNS if needed"
sudo ufw enable
```

Notes:

- The LLM API endpoint needs HTTPS egress. If you use a local Ollama instance instead, allow only the Ollama port and drop all other egress.
- Malware analysis wants zero egress. For hostile samples, disconnect the network entirely or run the sample in a second inner VM.
- `tcpdump` on the sandbox interface shows what a sample tried to do. Capture before you run.

### What NOT to install

- No IDE plugins that auto-run code (no Jupyter auto-execution for untrusted notebooks).
- No browser with saved credentials or synced profiles.
- No SSH keys, GPG keys, cloud CLI credentials (`aws`, `gcloud`, `gh auth` tokens belong on the host only).
- No production VPN clients. If you need one, it lives on the host, not the sandbox.
- No `npm install -g` of unvetted agent tooling without reading the source. The Shai-Hulud worm modified `~/.claude.json` and injected a rogue MCP server in 2026. Vet MCP servers before connecting them.
- No random "crack" or "keygen" tools. The sandbox is for analysis, not piracy tooling.
- No sudo-enabled agent account. Reported agentic attacks assume the agent can escalate. Do not give it the path.

---

## Step-by-Step

### Step 1: Base image

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y \
  build-essential git curl wget jq unzip xz-utils \
  python3 python3-pip python3-venv python3-dev \
  openjdk-21-jdk-headless \
  gdb binutils strace ltrace \
  tcpdump tshark \
  radare2 \
  upx-ucl \
  qemu-user qemu-user-static \
  wine64 \
  docker.io
```

Verify JDK:

```bash
java -version   # expect 21.x
```

### Step 2: Ghidra

```bash
GHIDRA_VERSION=12.2
curl -LO "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_${GHIDRA_VERSION}_build/ghidra_${GHIDRA_VERSION}_PUBLIC_${GHIDRA_VERSION//./}.zip"
unzip ghidra_${GHIDRA_VERSION}_PUBLIC_*.zip -d /opt/
sudo ln -s /opt/ghidra_${GHIDRA_VERSION}_PUBLIC /opt/ghidra
```

Set headless memory for large binaries (research report section 9.4):

```bash
export GHIDRA_HEADLESS_MAXMEM=8G   # in ~/.bashrc or the agent environment
```

### Step 3: Python RE tooling

```bash
python3 -m venv ~/re-venv
source ~/re-venv/bin/activate
pip install --upgrade pip
pip install frida-tools flare-capa flare-floss mitmproxy pwntools
pip install binwalk
```

Frida server for Android targets must match the `frida` pip version exactly. Frida 17.25.2 was the verified release tag on 2026-11-05.

### Step 4: Java/mobile tools

```bash
JADX_VERSION=1.5.6
curl -LO "https://github.com/skylot/jadx/releases/download/v${JADX_VERSION}/jadx-${JADX_VERSION}.zip"
unzip jadx-${JADX_VERSION}.zip -d /opt/
sudo ln -s /opt/jadx-${JADX_VERSION}/bin/jadx /usr/local/bin/jadx

APKTOOL_VERSION=3.0.3
curl -LO "https://github.com/iBotPeaches/Apktool/releases/download/v${APKTOOL_VERSION}/apktool_${APKTOOL_VERSION}.jar"
sudo ln -s $(pwd)/apktool_${APKTOOL_VERSION}.jar /usr/local/bin/apktool.jar
# Create the wrapper script per https://apktool.org/docs/install
```

### Step 5: GDB enhancement

```bash
# gef (Linux)
bash -c "$(curl -fsSL https://raw.githubusercontent.com/hugsy/gef/main/scripts/gef.sh)"
# Or pwndbg (alternative, pick one)
# git clone https://github.com/pwndbg/pwndbg && cd pwndbg && ./setup.sh
```

### Step 6: x64dbg under Wine

x64dbg is a Windows debugger. On Linux it runs under Wine. Reported stable path:

```bash
sudo dpkg --add-architecture i386
sudo apt update
sudo apt install -y wine64 wine32
# Download the x64dbg snapshot from https://x64dbg.com and extract to /opt/x64dbg
cd /opt/x64dbg/release && wine x96dbg.exe
```

Headless x64dbg automation through Wine is fragile. Treat it as interactive-only. For scripted Windows debugging prefer WinDbg under Wine is not recommended either. Use a Windows VM for serious x64dbg work.

### Step 7: Ollama for local models

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama pull qwen3-coder-next   # or your preferred local model
```

Hardware rules of thumb from the research report (section 9.4):

- 7-9B Q4 models: 8-16 GB VRAM or RAM. Weak on obfuscated code.
- 27-32B Q4 models: 20-24 GB VRAM.
- 70B+ models: 48 GB+ or heavy CPU offload.

### Step 8: Directory layout and users

```bash
sudo useradd -m -s /bin/bash re
sudo mkdir -p /work/{targets,analysis,evidence,scratch,scripts}
sudo chown -R re:re /work
sudo chmod 750 /work/targets /work/evidence
```

### Step 9: Full copy-paste script

Save as `setup-re-sandbox.sh` and run once on a fresh Ubuntu 24.04/25.x VM or container base:

```bash
#!/usr/bin/env bash
# setup-re-sandbox.sh — base Linux RE sandbox for AI-assisted work.
# Tested against Ubuntu 24.04 LTS package names. Debian 13 needs review.
set -euo pipefail

GHIDRA_VERSION="12.2"
GHIDRA_BUILD="$(echo ${GHIDRA_VERSION} | tr -d '.')"
JADX_VERSION="1.5.6"
APKTOOL_VERSION="3.0.3"
WORK=/work
RE_USER=re

if [[ $EUID -ne 0 ]]; then
  echo "Run as root (or inside a container as root)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y \
  build-essential git curl wget jq unzip xz-utils ca-certificates \
  python3 python3-pip python3-venv python3-dev \
  openjdk-21-jdk-headless \
  gdb binutils strace ltrace \
  tcpdump tshark \
  radare2 \
  upx-ucl \
  qemu-user qemu-user-static \
  wine64 \
  docker.io \
  ufw

# Users and layout
id -u ${RE_USER} &>/dev/null || useradd -m -s /bin/bash ${RE_USER}
mkdir -p ${WORK}/{targets,analysis,evidence,scratch,scripts}
chown -R ${RE_USER}:${RE_USER} ${WORK}
chmod 750 ${WORK}/targets ${WORK}/evidence

# Ghidra
if [[ ! -d /opt/ghidra-${GHIDRA_VERSION}_PUBLIC ]]; then
  cd /tmp
  curl -fLO "https://github.com/NationalSecurityAgency/ghidra/releases/download/Ghidra_${GHIDRA_VERSION}_build/ghidra_${GHIDRA_VERSION}_PUBLIC_${GHIDRA_BUILD}.zip"
  unzip -q ghidra_${GHIDRA_VERSION}_PUBLIC_${GHIDRA_BUILD}.zip -d /opt/
  ln -sfn /opt/ghidra-${GHIDRA_VERSION}_PUBLIC /opt/ghidra
fi

# JADX
if [[ ! -x /opt/jadx-${JADX_VERSION}/bin/jadx ]]; then
  cd /tmp
  curl -fLO "https://github.com/skylot/jadx/releases/download/v${JADX_VERSION}/jadx-${JADX_VERSION}.zip"
  unzip -q jadx-${JADX_VERSION}.zip -d /opt/
fi

# Apktool
if [[ ! -f /usr/local/bin/apktool.jar ]]; then
  cd /tmp
  curl -fLO "https://github.com/iBotPeaches/Apktool/releases/download/v${APKTOOL_VERSION}/apktool_${APKTOOL_VERSION}.jar"
  install -m 0644 apktool_${APKTOOL_VERSION}.jar /usr/local/bin/apktool.jar
  # apktool wrapper (per https://apktool.org/docs/install)
  cat > /usr/local/bin/apktool <<'EOF'
#!/bin/sh
exec java -jar /usr/local/bin/apktool.jar "$@"
EOF
  chmod +x /usr/local/bin/apktool
fi

# Python RE tooling into a venv owned by the re user
sudo -u ${RE_USER} python3 -m venv /home/${RE_USER}/re-venv
sudo -u ${RE_USER} /home/${RE_USER}/re-venv/bin/pip install --upgrade pip
sudo -u ${RE_USER} /home/${RE_USER}/re-venv/bin/pip install \
  frida-tools flare-capa flare-floss mitmproxy pwntools binwalk

# GEF for the re user
sudo -u ${RE_USER} bash -c 'if [[ ! -d ~/.gef ]]; then mkdir -p ~/.gef; curl -fsSL https://github.com/hugsy/gef/raw/main/gef.py -o ~/.gef/gef.py; grep -q gef ~/.bashrc || echo "source ~/.gef/gef.py" >> ~/.bashrc; fi'

# Firewall defaults (skip inside containers where ufw may not apply)
if command -v ufw >/dev/null && [[ -d /sys/class/net/eth0 ]]; then
  ufw --force reset
  ufw default deny incoming
  ufw default deny outgoing
  ufw allow out 443/tcp comment "HTTPS egress for packages and LLM APIs"
  ufw allow out 53/udp comment "DNS"
  ufw --force enable || true
fi

echo "Done. Log in as ${RE_USER}. Activate the venv: source ~/re-venv/bin/activate"
```

### Step 10: Smoke test

```bash
sudo -iu re
source ~/re-venv/bin/activate
java -version
/opt/ghidra/support/analyzeHeadless /tmp /tmp/proj -import /bin/ls -deleteProject
rizin -v || radare2 -v
frida --version
jadx --version
apktool --version
capa --version
floss --version || true
binwalk --version
strace -V | head -1
gdb --version | head -1
```

Expected: each command prints a version. Ghidra headless should create and delete a project without error.

---

## Pitfalls

- **Docker is not a security boundary.** Docker shares the host kernel. A container escape gives the attacker the host. For hostile samples use a VM or gVisor (`runsc`). The research report ranks gVisor and Kata Containers above plain Docker for isolation strength.
- **Prompt injection survives compilation.** Strings embedded in a binary reach the model through `strings`, decompiler comments, and capa output. A documented family of attacks (arXiv 2605.30667, 2605.30677) uses ChatML-format injection that survives into `.rodata`. Treat every tool output as untrusted data. Never let tool output authorize a tool call.
- **Read-only MCP mode matters.** GhidraMCP and similar servers expose write tools (rename, comment). Comment write-back is a demonstrated persistent injection channel (GhidraMCP issues #140/#141). Disable write tools during untrusted-binary sessions.
- **Frida version skew.** `frida-tools` pip and the `frida-server` binary on the target must match exactly. Pin versions in your scripts.
- **x64dbg under Wine is fragile.** It works for casual debugging. For serious Windows RE use a Windows VM or FLARE-VM.
- **Ghidra 12.0.3+ required.** GHSA-mc3p-mq2p-xw6v (malicious Mach-O `CFStrings` with `{@execute}` annotations leading to RCE) is fixed in Ghidra 12.0.3 and later. The script pins 12.2.
- **Do not run the agent as root.** The agent CLI inherits the user's privileges. Root agent equals root compromise.
- **Snapshots lie about network state.** A reverted VM keeps disk state but live connections die. If malware called home during the session, the snapshot revert does not un-send the packet. Capture traffic first.
- **capa rules need updates.** `flare-capa` rules ship separately and age. Update the ruleset periodically.
- **binwalk 3.x changed the CLI.** Older tutorials use `binwalk -e` differently. Check `binwalk --help` for your version.

---

## See Also

- `../02-collab/claude-code-setup.md` — connecting Claude Code or Codex CLI to this sandbox
- `../05-tools/mcp-catalog.md` — exposing Ghidra to the agent over MCP
- `../03-decomp/verification-loop.md` — the deterministic check that keeps the agent honest
- `../04-dynamic/frida-deep-dive.md` — Frida scripts against Android and desktop targets
- `../06-topics/firmware-iot-re.md` — firmware unpacking pipeline
- `../07-advanced/ai-security-threats.md` — the attack surface this sandbox exists to contain
- `../06-topics/mobile-android-re.md` — jadx plus apktool workflow for Android targets
- `./linux-sandbox-base.md` — ephemeral cloud variant of this setup
- `../07-advanced/model-selection.md` — running the model inside the sandbox perimeter
