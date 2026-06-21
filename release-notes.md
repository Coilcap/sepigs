# sepigs v0.1.0-rc1

`v0.1.0-rc1` promotes the alpha into a controlled beta release candidate. It adds release verification and long-run infrastructure only; it does not add protocols.

## Completed Capabilities

- HTTP proxy and SOCKS5 inbounds with optional authentication.
- direct, block, tcpRelay, Shadowsocks, and Trojan outbound paths through the unified registry.
- Routing rules, policy health, failover, active probing, DNS cache/UDP/DoH fallback, and reload support.
- Connection/resource/timeout management, leak detection, Prometheus metrics, alert rules, and Grafana example.
- Manifest-validated plugin loading, worker/child-process isolation, and JSON-safe remote outbound factory RPC.
- Resumable 1h, 6h, and 24h soak profiles with checkpoint, JSONL metrics, failure samples, and final reports.
- Client acceptance packets for Mihomo, Shadowrocket, Surge, Stash, NekoBox, and v2rayN.
- CI, release dry-run, beta checklist, technical debt audit, and Reality Check v2.

## Verification Evidence

- Clean 1-hour soak: 456,990 operations, zero errors, final tracked sockets/timers/listeners at 0/0/0.
- 6-hour profile infrastructure check: 101,849 operations over 10 minutes, zero errors.
- Benchmark: 6,600/6,600 connections, no retained tracked resources.
- Full automated suite, lint, typecheck, build, docs check, and release dry-run are release gates.
- RC1 automated suite: 66/66 tests passed.
- 24-hour profile infrastructure smoke: 228/228 operations with zero errors; this is not a 24-hour soak result.

## Limitations

- Full 24-hour soak is implemented but not executed.
- GUI/mobile acceptance packets are unsigned until run on real clients.
- Shadowsocks/Trojan external reference binaries were unavailable; local fixtures are not ecosystem certification.
- Generic proxy tunnels are not pooled or reused.
- Metrics have no built-in authentication and must remain local or sit behind a protected endpoint.

## Experimental

- QUIC adapter boundary, native Hysteria2 research, and WireGuard packet transport remain unavailable and unchanged.
- WASM data-path transforms, fake-ip, remote plugin stream transforms, and full OS plugin sandboxing are not production capabilities.
- Active probing does not automatically synthesize a probe for every outbound type.

## Upgrade From v0.1.0-alpha

1. Run `npm install` and `npm run build` with Node.js 20.11 or newer.
2. Validate the existing config with `npm run docs:check`; `configVersion` remains `1`.
3. Keep HTTP/SOCKS listeners on localhost or enable authentication before binding publicly.
4. Keep metrics on `127.0.0.1` or place them behind an authenticated reverse proxy.
5. Review plugin manifests: isolated remote outbound factories require `outbound:register` permission and API version `1`.
6. Run `npm test`, `npm run benchmark`, and the appropriate soak profile before deployment.

No config migration is required from the alpha when the configuration already uses version `1`.
