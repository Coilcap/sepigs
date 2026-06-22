# sepigs v0.2.0-beta

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
- UDP benchmark: 2,000/2,000 packets, zero errors, 32.69 Mbps, p95 0.18 ms, and final resources 0/0/0.
- 30-minute mixed gate: 0.05345% recoverable error rate, below the 0.1% beta threshold, with final resources 0/0/0.
- Ten-minute short soak: 19,071/19,071 requests, zero errors, 120 reloads, and final resources 0/0/0.
- External reference clients: 0 verified, 11 skipped with explicit missing-binary reasons.

The mixed-gate errors were limited to fake-IP CONNECT read timeouts during reload pressure. This remains a beta risk and blocks a production-stable claim.

## Upgrade

Configuration version remains `1`. New features remain disabled by default. Re-run `npm run security:check`, `npm run benchmark:gate`, and `npm run soak:gate` in the deployment environment before promotion.

No stable tag or GitHub Release is created by Phase 9.
