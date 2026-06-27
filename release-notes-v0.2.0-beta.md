# sepigs v0.2.0-beta.0

This beta hardens the Phase 8 feature set without adding protocols.

## Highlights

- Bounded SOCKS5 UDP full-chain with load, timeout, limit, reload, fake-IP, metrics, benchmark, and cleanup coverage.
- Fake-IP lifecycle, persistence, real-cache isolation, and reload continuity.
- Local authenticated Dashboard API with rate limiting, redaction, reload containment, and precise connection termination.
- Deterministic subscription parsing/redaction for documented URI and structured subsets.
- Performance, mixed soak, security, external-binary detection, manual-client verification, and release artifact gates.

## Experimental or Unsupported

Web Dashboard, Shadowsocks/Trojan inbounds, WireGuard adapter, TUN mock, and QUIC adapter remain experimental. Native TUN, native QUIC/Hysteria2, active WireGuard forwarding, Shadowsocks UDP inbound, and remote subscription fetching remain unsupported.

## Validation

- Automated suite: 105/105 passed.
- TCP benchmark: 6,600/6,600 connections, zero failures, and final resources 0/0/0.
- UDP benchmark: 2,000/2,000 packets, zero errors, 31.29 Mbps, p95 0.20 ms, and final resources 0/0/0.
- 30-minute mixed gate: latest Phase 11 run had 465,784 successes, 239 recoverable fake-IP CONNECT read timeouts, 0.05129% error rate, and final resources 0/0/0.
- Ten-minute short soak: 16,609/16,609 requests, zero errors, 104 reloads, and final resources 0/0/0.
- Full checkpoint-resumed 24-hour soak: 14,645,605 successes, 11 errors
  (0.00007511%), p95 7.82 ms, 17,303 reloads, and final resources 0/0/0.
- User manual signoff: Chrome/system proxy, Mihomo, Shadowrocket, Clash Verge,
  Stash, Surge, v2rayN, and NekoBox passed. Detailed device/client metadata was
  not supplied and remains unknown.
- External reference clients: 0 verified, 11 blocked, and 0 failed. `sing-box`
  and `xray` are installed, but this release has no vetted automatic launcher.

The mixed-gate errors remain concentrated in fake-IP CONNECT read timeouts during reload pressure. This remains a beta risk and blocks a production-stable claim.

## Upgrade

Configuration version remains `1`. New features remain disabled by default. Re-run `npm run security:check`, `npm run benchmark:gate`, and `npm run soak:gate` in the deployment environment before promotion.

The package version is `0.2.0-beta.0`. This is a public beta prerelease, not a
production-stable release. The existing beta tag remains unchanged. Native TUN,
native QUIC/Hysteria2, active WireGuard forwarding, Shadowsocks UDP inbound,
and remote subscription fetching remain unsupported; Web Dashboard,
Shadowsocks/Trojan inbounds, WireGuard adapter, TUN mock, and QUIC adapter
remain experimental.
