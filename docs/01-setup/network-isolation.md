# Network Isolation for RE Labs

> Tags: network, sandboxing, nftables, mitmproxy, FakeNet-NG, egress-filtering | Difficulty: intermediate | Prerequisites: Linux host or VM, comfort with `nft`, `iptables`, and `tcpdump`

## Overview

A reverse engineering lab detonates untrusted binaries. Malware samples beacon to command-and-control servers. Exploit PoCs phone home. Ransomware encrypts network shares. The default network path lets all of this reach the real Internet. Network isolation gives you control over where that traffic goes.

The goal is two classes of control:

1. **Containment.** The sample must not reach the real Internet. Every egress path needs a policy. DNS, ICMP, raw sockets, and IPv6 all count as egress.
2. **Observability.** Sample traffic must land somewhere you can see it. Redirect it to fake services. Record it in PCAP files. Decode TLS when the sample uses it.

Network isolation also protects the AI agent. Agent tools like GhidraMCP or JSHookMCP send decompiled output to a model API. That API traffic is a second network stream with different trust rules. It must stay separate from sample traffic. A sample can embed prompt-injection strings that survive compilation. See `../07-advanced/ai-security-threats.md`.

The standard lab has two zones:

| Zone | Traffic | Policy |
|---|---|---|
| Agent zone | Model API calls, package downloads, MCP server traffic | Allowlist of known providers. Proxied and logged. |
| Sample zone | Malware or PoC traffic inside the VM or container | All egress denied or sinkholed. No real Internet path. |

A flat network breaks both zones. One shared interface means the sample can reach the model API, and the agent can reach the sample's command-and-control. Put the zones on separate interfaces, separate VLANs, or separate VMs with a controlled router between them.

## Setup

### nftables egress allowlist

Use nftables on the host and on any Linux sandbox guest. An egress allowlist drops every outbound packet except what you name. This is the inverse of a blacklist, and it is the correct default for a hostile binary.

Write `/etc/nftables.conf`:

```nft
#!/usr/sbin/nft -f
flush ruleset

table inet filter {
    chain output {
        type filter hook output priority 0; policy drop;

        # Local traffic stays local.
        oifname "lo" accept

        # Established replies are allowed.
        ct state established,related accept

        # DNS to the lab resolver only.
        udp dport 53 ip daddr 192.168.66.1 accept
        tcp dport 53 ip daddr 192.168.66.1 accept

        # The fake-services proxy.
        tcp dport 8080 ip daddr 192.168.66.1 accept

        # The agent zone allowlist. Adjust for your provider.
        tcp dport { 443 } ip daddr { 104.18.0.0/16, 172.64.0.0/13 } accept

        # Everything else is dropped.
    }
}
```

Load and verify:

```bash
nft -f /etc/nftables.conf
nft list ruleset
```

Save the ruleset to a file before you test it. A bad filter drops your SSH session. Test the file from a second shell first.

```bash
nft -c -f /etc/nftables.conf   # check syntax only
nft list ruleset > /root/nftables-backup.nft
```

Add an IPv6 table. `inet` covers IPv4 only in this snippet. If the guest has IPv6, repeat the chain under `ip6` or deny IPv6 output explicitly:

```nft
table ip6 filter {
    chain output {
        type filter hook output priority 0; policy drop;
        oifname "lo" accept
        ct state established,related accept
        # no other v6 egress
    }
}
```

A `policy drop` output chain is the single most important rule in the lab. Everything else in this page assumes it exists.

For a quick throwaway sandbox, prefer a network namespace over touching the host:

```bash
ip netns add sample-zone
ip netns exec sample-zone nft -f /etc/nftables-sample.conf
```

### DNS sinkhole

DNS is the first channel malware uses. Sinkhole it before the sample runs.

Two options:

- **Point guest DNS at a sinkhole resolver.** Run dnsmasq or CoreDNS on the lab gateway. Answer every query with the sinkhole IP or NXDOMAIN. Log every query.
- **Override `/etc/hosts` inside the guest.** Cheap and effective for known domains.

The nftables rules above already restrict UDP and TCP port 53 to the lab resolver. Without that restriction the sinkhole is cosmetic, because the sample resolves through its own hard-coded resolver.

On the gateway, a dnsmasq sinkhole looks like this:

```conf
# /etc/dnsmasq.d/sinkhole.conf
address=/#/192.168.66.66
log-queries
log-facility=/var/log/dnsmasq-sinkhole.log
```

Every DNS answer is the sinkhole address `192.168.66.66`. FakeNet-NG or INetSim then answers on that address. Queries stay in the log, which gives you the sample's domain list without touching the real Internet.

Some samples skip DNS and hard-code IP addresses. Fake services below cover that case by intercepting the connection itself.

### Fake services: INetSim

[INetSim](http://www.inetsim.org/) simulates common internet services for malware analysis: HTTP, SMTP, FTP, DNS, IRC, and more. The current release is 1.3.2 from 2020. The project is unmaintained. It still works on Debian-based guests and ships preinstalled on REMnux.

Install on Debian or Ubuntu:

```bash
sudo apt-get install inetsim
sudo inetsim --help
```

The default configuration is `/etc/inetsim/inetsim.conf`. Enable the services you want and set the bind address to the guest-facing interface:

```conf
# /etc/inetsim/inetsim.conf
bind_address = 0.0.0.0
```

Service sections look like this:

```conf
service_bind_address = {
    http     = 0.0.0.0
    dns      = 0.0.0.0
    smtp     = 0.0.0.0
}
```

Start it:

```bash
sudo systemctl start inetsim
sudo journalctl -u inetsim -f
```

INetSim writes per-service logs under `/var/log/inetsim/`. HTTP requests land in `http.log`. DNS queries land in `dns.log`. Point the sinkhole resolver at the INetSim host, or NAT the guest's traffic to it with nftables.

INetSim simulates protocols but does not intercept traffic by itself. The nftables rules or a second VM must route sample traffic to it.

### Fake services: FakeNet-NG

[FakeNet-NG](https://github.com/mandiant/flare-fakenet-ng) is the current-generation fake-services tool. Latest release is v3.5 from April 2025. The repo is maintained by Mandiant and still receives commits.

FakeNet-NG intercepts traffic itself. On Windows it uses WinDivert. On Linux it uses python-netfilterqueue. It simulates DNS, HTTP, HTTPS, SMTP, FTP, TFTP, IRC, POP3, BITS, and raw TCP or UDP. It writes a PCAP and an HTML report of network-based indicators.

On Windows, download the standalone executable from the releases page and run `fakenet.exe` as Administrator. On Linux:

```bash
sudo systemctl stop systemd-resolved   # free port 53 for the DNS listener
python -m pip install https://github.com/mandiant/flare-fakenet-ng/zipball/master
sudo fakenet
```

Linux needs `libnetfilter-queue-dev`, `libffi-dev`, `libssl-dev`, and Python development files. See the repo README for the exact apt list.

The default config is `configs/default.ini`. Key Diverter settings:

```ini
[Diverter]
NetworkMode:            Auto
LinuxRedirectNonlocal:  *
LinuxFlushIptables:     Yes
DumpPackets:            Yes
RedirectAllTraffic:     Yes
DefaultTCPListener:     ProxyTCPListener
DefaultUDPListener:     ProxyUDPListener
```

`RedirectAllTraffic` sends traffic on unknown ports to the proxy listener, which guesses the protocol. `DumpPackets` writes `packets_<timestamp>.pcap` in the working directory.

Add listeners for services you care about:

```ini
[HTTPListener80]
Enabled:     True
Port:        80
Protocol:    TCP
Listener:    HTTPListener
DumpHTTPPosts: True
DumpHTTPPostsFilePrefix: post_
```

`DumpHTTPPosts` saves POST bodies to disk. That is where you find exfiltrated data and C2 tasking.

FakeNet-NG's own nftables or iptables changes can conflict with your egress allowlist. Set `LinuxFlushIptables: No` if you manage rules yourself, and add explicit nftables rules that accept the FakeNet-NG listener ports.

### mitmproxy for TLS inspection

Many samples encrypt C2 traffic with TLS. Fake services see the ciphertext. mitmproxy terminates TLS, logs the plaintext, and re-encrypts toward the client.

Install and run it as a transparent proxy or a regular proxy:

```bash
pip install mitmproxy
mitmproxy --mode transparent --listen-port 8080 -w flows.mitm
```

For a regular proxy mode, the sample must honor `HTTP_PROXY` and `HTTPS_PROXY`. Many do not. Use transparent mode with nftables redirection instead:

```nft
table inet mitm {
    chain prerouting {
        type nat hook prerouting priority -100; policy accept;
        iifname "sample0" tcp dport { 80, 443 } redirect to :8080
    }
}
```

mitmproxy generates a CA certificate on first run. Install `~/.mitmproxy/mitmproxy-ca-cert.pem` into the guest trust store for clean TLS. Samples with certificate pinning still fail. For those, log the TLS metadata and move on. The SNI and destination IP are often enough for triage.

Write custom mitmproxy addons to tag flows with the sample's process name. The report's verified workflow uses mitmproxy inside RE toolchains such as rea-agent-docker for exactly this purpose.

### Isolate agent API traffic from target traffic

The agent and the sample are two different trust domains. Keep their packets on different interfaces.

Recommended layout:

```
Host
├── eth0  → agent zone (NAT out, allowlisted)
│            - model API (api.anthropic.com, api.openai.com, openrouter.ai)
│            - MCP servers on localhost
│            - package mirrors
└── virbr-sample → sample zone (no route out)
                 - Windows or Linux guest running the binary
                 - default gateway is the sinkhole, not the router
```

Concrete steps:

1. Create a second libvirt network with no forwarding:

```bash
virsh net-define sample-net.xml
virsh net-start sample-net
```

```xml
<network>
  <name>sample-net</name>
  <bridge name='virbr-sample'/>
  <forward mode='none'/>
  <ip address='192.168.66.1' netmask='255.255.255.0'/>
</network>
```

2. Attach the RE guest to `sample-net` only. Attach your agent host or dev container to `eth0`.
3. Run the sinkhole and fake services on `192.168.66.1`, reachable only from `sample-net`.
4. Give the agent zone its own nftables output chain that allows only provider IP ranges and your MCP endpoints.

If you run the agent inside a container on the host, use `--network` scoping. Run MCP servers on a Docker network that has no route to `virbr-sample`.

Proxychains is the fallback when you cannot split interfaces. It forces a process through a proxy. See the next section.

### proxychains for tools that ignore environment variables

Many RE tools ignore `HTTP_PROXY` and `HTTPS_PROXY`. They open raw sockets. proxychains hooks `connect()` calls in dynamically linked binaries and redirects them through a SOCKS or HTTP proxy.

Use the maintained fork, [rofl0r/proxychains-ng](https://github.com/rofl0r/proxychains-ng). Latest release is v4.17.

Install on Debian or Ubuntu:

```bash
sudo apt-get install proxychains4
# or build from source:
git clone https://github.com/rofl0r/proxychains-ng
cd proxychains-ng
./configure --prefix=/usr --sysconfdir=/etc
make && sudo make install
sudo cp proxychains.conf /etc/proxychains4.conf
```

Configure `/etc/proxychains4.conf`. Disable the DNS proxying block unless you want remote DNS:

```conf
strict_chain
proxy_dns
[ProxyList]
socks5 127.0.0.1 1080
```

Run a tool through it:

```bash
proxychains4 radare2 -A ./sample.bin
proxychains4 curl https://api.example.com
```

Limitations:

- proxychains works only on dynamically linked binaries. Statically linked tools bypass it.
- It does not proxy UDP by default. DNS goes through `proxy_dns` to the SOCKS server.
- It does not help a statically linked Go or Rust binary. Use nftables redirects instead.
- It adds latency. Analysis tools that open many sockets may slow down.

For tools that do honor environment variables, set them directly:

```bash
export HTTP_PROXY=http://127.0.0.1:8080
export HTTPS_PROXY=http://127.0.0.1:8080
export ALL_PROXY=socks5://127.0.0.1:1080
```

Point those at a logging proxy like mitmproxy or a Squid instance on the agent zone.

## Step-by-Step

### Verify isolation before detonation

Never run the sample first and check the firewall after. Verify the network path before the binary executes.

From inside the sample zone:

```bash
# 1. Confirm no default route to the real Internet.
ip route show default
# Expected: only the sinkhole gateway, or no default route.

# 2. Try to reach a real IP directly.
curl --connect-timeout 3 http://1.1.1.1
# Expected: timeout or connection refused. Not a response.

# 3. Try DNS.
dig @8.8.8.8 google.com
# Expected: timeout or refused. The nftables rule blocks port 53 except to the sinkhole.

# 4. Try the sinkhole.
dig @192.168.66.1 evil-c2.example.com
# Expected: answer 192.168.66.66 or NXDOMAIN. Logged in dnsmasq.

# 5. Test fake services.
curl http://192.168.66.66/
# Expected: FakeNet-NG or INetSim response.
```

From the host, watch the sample's traffic live:

```bash
tcpdump -i virbr-sample -w sample-session.pcap 'not port 22'
tshark -r sample-session.pcap -Y 'dns' -T fields -e dns.qry.name
```

Watch for leaks while the sample runs:

```bash
# On the host, confirm nothing leaves eth0 from the sample subnet.
tcpdump -i eth0 'src net 192.168.66.0/24'
# Expected: empty. Any packet here is an isolation failure.
```

Check for DNS leaks through alternate resolvers:

```bash
# Inside the guest.
ss -ulnp | grep -E ':53|:5353'
# Look for hard-coded resolvers or DoH clients the nftables rules cannot see.
```

DoH and DoT bypass the port-53 sinkhole. Block known DoH endpoints in the allowlist, or accept that a determined sample can tunnel. The nftables drop rule still contains it, because there is no route out.

### Detonation runbook

1. Snapshot the VM before detonation. Restore is faster than cleanup.
2. Start the sinkhole, FakeNet-NG or INetSim, and mitmproxy.
3. Start `tcpdump` on the sample interface.
4. Run the verification commands above.
5. Execute the sample under the debugger or sandbox monitor.
6. Stop capture. Review PCAP, FakeNet-NG HTML report, mitmproxy flows, and dnsmasq log.
7. Extract IOCs: domains, IPs, JA3 fingerprints, URLs, dropped files.

## Pitfalls

- **IPv6 bypass.** An IPv4-only nftables ruleset leaves IPv6 open. Add the `ip6` table or disable IPv6 in the guest.
- **ICMP and raw sockets.** `policy drop` on output covers all protocols. A blacklist that only filters TCP and UDP misses ICMP tunnels and raw-socket exfiltration.
- **Hard-coded DNS.** Samples that resolve through `8.8.8.8` directly bypass the local resolver. The nftables port-53 rule must restrict destination IP, not just port.
- **DoH and DoT.** DNS-over-HTTPS uses port 443. Your HTTPS allowlist may permit it. Block known DoH resolvers or accept the leak is contained but unlogged.
- **FakeNet-NG port conflicts.** Its DNS listener needs port 53. Stop `systemd-resolved` on the host first. Its `LinuxFlushIptables` can wipe your allowlist. Set it to `No`.
- **INetSim age.** Version 1.3.2 dates to 2020. Some modern TLS samples confuse it. It is still useful for HTTP, SMTP, and FTP simulation.
- **mitmproxy and pinning.** Certificate pinning defeats TLS interception. You still get SNI and IP metadata. Do not assume plaintext capture for every sample.
- **proxychains gaps.** Static binaries ignore it. UDP ignores it. It does not replace nftables.
- **Agent and sample on one interface.** A single `eth0` means the sample can reach the model API and exfiltrate decompiled output. Split the zones.
- **Snapshot revert leaks.** A VM snapshot taken before isolation was configured reverts the firewall too. Snapshot after verification.
- **Cloud sandbox defaults.** ANY.RUN, Joe Sandbox, and similar services have their own egress policies. Read them before assuming containment. The report marks some as unverified.

## See Also

- `./agent-sandboxing.md` — VM and container isolation options
- `../07-advanced/ai-security-threats.md` — injection attacks through tool output
- `./agent-sandboxing.md` — separating agent credentials from sample traffic
- `../06-topics/malware-analysis.md` — detonation workflow
- `./network-isolation.md` — mitmproxy addons and workflow
- `./network-isolation.md` — FakeNet-NG configuration reference
- `./network-isolation.md` — INetSim service configuration
- `../03-decomp/verification-loop.md` — verifying agent output before trusting it
