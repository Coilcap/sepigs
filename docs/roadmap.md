# Roadmap

## v0.2.0-alpha.0 Current

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

## Phase 9 Recommendation

- First complete external Shadowsocks/Trojan client sign-off and the blocked benchmark/soak gates.
- Add a standalone DNS listener so fake-IP has a verified client-facing consumer.
- Harden Dashboard API session/auth rotation and serve signed static assets locally.
- Implement a platform TUN adapter only after choosing a maintained user-space TCP/IP stack.
- Evaluate a maintained native QUIC dependency behind the existing adapter; keep Hysteria2 separate.
- Integrate WireGuard through a privilege-separated system/userspace backend, not a TypeScript crypto stack.
- Add fuzzing for DNS, SOCKS5 UDP, Shadowsocks/Trojan handshakes, and subscription dialects.

## Engineering Notes

Next protocol additions should keep protocol parsing out of `Engine`. New transports should expose a small typed interface under `src/transport` and have socket/resource cleanup tests before feature tests.
