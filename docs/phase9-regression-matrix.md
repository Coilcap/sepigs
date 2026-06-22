# Phase 9 Regression Matrix

| Feature | Status | Evidence and boundary |
| --- | --- | --- |
| UDP full-chain | beta-ready | SOCKS5 inbound to direct/block UDP, fake-IP restore, reload, limits, timeout, metrics, load test, 2,000-packet benchmark, and resource cleanup. The 30-minute mixed gate passed at 0.05345% aggregate errors. No 24-hour UDP soak or broad real-client matrix. |
| SOCKS5 UDP ASSOCIATE | beta-ready | Local end-to-end packet relay and malformed-fragment rejection pass. Association source pinning/NAT diversity remain limited. |
| fake-IP DNS | beta-ready | TTL, LRU, persistence, cache isolation, router restore, TCP/UDP paths, and reload continuity pass. Standalone DNS listener remains unavailable. |
| subscription parser | beta-ready | Documented SS/Trojan URI, Clash, sing-box, and Xray subsets have deterministic normalization, warnings, failure tests, and redaction. Remote fetching is unsupported. |
| Dashboard API | beta-ready | Local-only default, token auth, rate limit, recursive redaction, reload containment, metrics, and targeted connection kill pass. It is not an Internet management API. |
| Web Dashboard | experimental | Dependency-free build passes and errors are rendered locally. No browser automation, secure token store, or public deployment support. |
| Shadowsocks inbound | experimental | Three AEAD methods, wrong password, local large/framed traffic, and close behavior are fixture-tested. External reference clients are unavailable. |
| Trojan inbound | experimental | Password framing and local TCP relay pass; TLS has a documented certificate boundary. External TLS/SNI interoperability is unverified. |
| WireGuard adapter | experimental | Config/capability/external-process lifecycle boundary only. Active packet forwarding is unsupported. |
| TUN mock | experimental | IPv4 parsing and mock device IO pass. Native device creation and route management are unsupported. |
| QUIC adapter boundary | experimental | Missing-dependency and mock adapters pass. Native QUIC and Hysteria2 are unsupported. |

No Phase 8 feature is promoted to production-ready by Phase 9.

The mixed gate's 239 recoverable errors were all fake-IP CONNECT read timeouts during reload pressure. Resources returned to zero and the aggregate rate remained below the beta threshold, but this concentration remains a beta risk for longer host soak and profiling.
