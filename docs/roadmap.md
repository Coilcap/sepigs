# Roadmap

## v0.1 Current

- TypeScript ESM project skeleton.
- JSON/YAML config with validation.
- Rule-set files.
- HTTP and SOCKS5 TCP inbounds.
- SOCKS5 UDP ASSOCIATE with direct UDP relay.
- direct, block, and tcpRelay outbounds.
- Shadowsocks AEAD outbound.
- Trojan outbound with TLS/plain test mode.
- WireGuard outbound config and capability boundary.
- DNS resolver, GeoIP/GeoSite expansion, and subscription parser.
- Domain, CIDR, port, default, and block routing through outbound tags.
- Lifecycle, graceful shutdown, TCP/UDP stats, tests, docs, and a benchmark tool.
- Dynamic plugin modules using the `plugin.*` namespace.
- WASM extension loading.
- Worker thread pool for extension/control-plane CPU tasks.
- QUIC transport interface and capability-boundary implementation.
- Zero-copy relay helper based on stream piping.
- TCP connection pool primitive.
- Routing policies for load balancing, least-latency selection, and automatic failover.
- Config and rule-set hot reload.

## Next Stage

- Full WireGuard packet tunnel transport.
- VLESS-like architecture reservation.
- Native QUIC/Hysteria2 transport implementation or plugin adapter.
- Background active latency probes with configurable intervals.
- Web dashboard.
- Subscription-to-config generation CLI.
- TUN mode.
- UDP relay improvements, including association reuse and broader IPv6 coverage.
- Benchmark scenarios for SOCKS5, UDP, policy routing, and hot reload.
- Long-running soak mode with heap/CPU trend reports.

## Engineering Notes

Next protocol additions should keep protocol parsing out of `Engine`. New transports should expose a small typed interface under `src/transport` and have socket/resource cleanup tests before feature tests.
