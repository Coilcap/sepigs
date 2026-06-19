# Changelog

## 0.1.0-alpha

- Initial modular proxy kernel.
- HTTP and SOCKS5 inbounds.
- direct, block, tcpRelay, Shadowsocks, Trojan, WireGuard capability-boundary outbounds.
- Runtime hardening: connection manager, leak detector, resource limiter, stats, benchmark.
- Phase 5 hardening: auth, inbound drain reload, active probing, DNS UDP, plugin manifests, profiling and soak tools.
- Phase 7 hardening: resumable full soak runner, client config matrix, protocol compatibility reports, Prometheus alerts, remote plugin factory RPC, docs check, and security regression tests.
