# Changelog

## 0.2.0-beta.0

- Added UDP load/timeout/limit/full-chain regression coverage and a 2,000-packet benchmark gate.
- Fixed Direct UDP to use the configured DNS resolver and preserved compatible fake-IP mappings across route reloads.
- Hardened Dashboard rate limiting, secret redaction, reload continuity, and targeted connection termination.
- Added subscription failure/redaction/compatibility regression tests.
- Added mixed soak, external compatibility detection, security scan, manual client verification pack, and beta release artifact audit.
- Passed the 30-minute mixed gate below 0.1% errors and the ten-minute short soak with zero errors and zero final resources.
- Added the beta release closure checklist, transactional reload design, security summary, resumable 24-hour report path, and human client sign-off records.

## 0.2.0-alpha.0

- Added bounded SOCKS5 UDP session lifecycle and UDP metrics.
- Added fake-IP allocation/reverse-routing core and hardened DNS cache.
- Added local authenticated Dashboard API and experimental minimal Web UI.
- Expanded local subscription conversion for Clash, sing-box, Xray subsets, SS and Trojan URIs.
- Added Shadowsocks/Trojan TCP inbounds plus experimental TUN, QUIC, and WireGuard adapter boundaries.
- Fixed lifecycle unregister, shutdown timer cleanup, and plugin factory ownership/unload.

## 0.1.0-rc1

- Added real-client acceptance packets without claiming unsigned clients as verified.
- Added beta readiness, technical debt, and Reality Check v2 audits.
- Added resumable 24-hour soak infrastructure and report paths.
- Added RC1 release notes and upgrade guidance.
- No protocols or data-plane transports were added.

## 0.1.0-alpha

- Initial modular proxy kernel.
- HTTP and SOCKS5 inbounds.
- direct, block, tcpRelay, Shadowsocks, Trojan, WireGuard capability-boundary outbounds.
- Runtime hardening: connection manager, leak detector, resource limiter, stats, benchmark.
- Phase 5 hardening: auth, inbound drain reload, active probing, DNS UDP, plugin manifests, profiling and soak tools.
- Phase 7 hardening: resumable full soak runner, client config matrix, protocol compatibility reports, Prometheus alerts, remote plugin factory RPC, docs check, and security regression tests.
