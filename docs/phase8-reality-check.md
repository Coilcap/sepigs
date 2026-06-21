# Phase 8 Reality Check

## Beta-Ready

- RC1 HTTP/SOCKS TCP paths, direct/block/tcpRelay, routing, auth, metrics, lifecycle, hot reload, and plugin isolation.
- SOCKS5 UDP ASSOCIATE with session limits, idle reclaim, metrics, direct/block forwarding, and graceful shutdown.
- Fake-IP allocation/store/reverse-routing core with bounded LRU, TTL, and optional persistence.
- Local Dashboard API with auth, rate limit, redaction, connection control, metrics, logs, and file reload callback.
- Local subscription parsing for documented SS/Trojan/Clash/sing-box/Xray subsets.

## Experimental

- Minimal static Web Dashboard.
- Shadowsocks TCP inbound: all three AEAD methods pass local encrypted end-to-end fixtures; external reference sign-off remains pending.
- Trojan inbound: TCP framing/auth works; plaintext mode is a compatibility test boundary and production use requires configured TLS certificates.
- TUN mock architecture and IPv4 packet parser; the native device is unsupported.
- QUIC adapter/mock is experimental; native QUIC and Hysteria2 are unsupported.
- WireGuard external-process transport adapter is experimental; active packet forwarding is unsupported.
- Fake-IP until a standalone DNS listener or verified TUN path consumes client-facing answers.

## Unsupported

- Native TUN device and user-space TCP/IP stack.
- Native QUIC and Hysteria2.
- Active WireGuard packet forwarding.
- Shadowsocks UDP inbound.
- Xray VMess/VLESS subscription conversion and remote subscription fetching.

No Phase 8 experimental capability is enabled by default.

## Validation Boundary

Phase 8.5 completed benchmark, the full ten-minute short soak, and the seven-scenario soak matrix outside the restricted network sandbox. UDP full-chain remains beta-ready, not production-ready: it has local end-to-end and soak coverage, but not a 24-hour run or broad real-client UDP interoperability matrix.
