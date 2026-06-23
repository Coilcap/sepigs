# Roadmap

## v0.2.0-beta.0 Current

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

Phase 8 additionally includes bounded UDP sessions, fake-IP core, local Dashboard API, minimal Web UI, expanded subscription parsing, Shadowsocks/Trojan TCP inbounds, and explicit TUN/QUIC/WireGuard experimental adapters. See `docs/phase8-reality-check.md` for capability boundaries.

Phase 9 adds regression, UDP performance, mixed soak, secret scanning, external-binary detection, and release artifact gates without adding protocols. See `docs/phase9-regression-matrix.md` for status and evidence.

## Phase 10 Recommendation

- Complete signed GUI/mobile worksheets and external Shadowsocks/Trojan reference-client runs.
- Run the existing resumable 24-hour profile on the intended deployment host.
- Make config reload transactional across metrics, Dashboard, plugins, and outbound replacement.
- Add parser fuzzing for DNS, SOCKS5 UDP, Shadowsocks/Trojan handshakes, and subscription dialects.
- Establish cross-platform CI and signed artifact provenance before a stable release.

## Engineering Notes

Next protocol additions should keep protocol parsing out of `Engine`. New transports should expose a small typed interface under `src/transport` and have socket/resource cleanup tests before feature tests.
