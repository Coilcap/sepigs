# Changelog

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
