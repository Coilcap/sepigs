# sepigs

Current development line: `v0.2.0-beta` (Phase 9 hardening). Experimental packet, management, and transport features remain disabled by default.

sepigs is a small TypeScript/Node.js proxy core for legal personal proxying, local forwarding, learning, and self-hosted services. The first version focuses on a stable architecture instead of many protocols.

See `release-notes-v0.2.0-beta.md`, `docs/v0.2.0-beta-readiness.md`, and `docs/phase9-regression-matrix.md` for the release boundary.

## Features

- HTTP proxy inbound with `CONNECT` and basic absolute-form HTTP forwarding.
- SOCKS5 inbound with no-auth `CONNECT` and optional UDP ASSOCIATE relay.
- Optional HTTP Basic Auth and SOCKS5 username/password auth.
- `direct`, `block`, fixed-target `tcpRelay`, Shadowsocks, and Trojan outbounds, plus an experimental WireGuard adapter boundary.
- Router rules for exact domains, domain suffixes, IP CIDR, destination ports, and default outbound selection.
- DNS module with static hosts, cache TTL, and IP family strategy.
- GeoIP/GeoSite expansion into existing router rules without changing router matching logic.
- JSON/YAML config validation with clear errors.
- Rule-set files that expand into route rules at load time.
- Subscription parser for `ss://`, `trojan://`, `wireguard://`, JSON, and YAML outbound lists.
- Connection manager with active connection query, forced close, byte accounting, and timeout recycling.
- Resource limiter with configurable maximum concurrent connections.
- Leak detector for tracked sockets, timers, and listeners.
- Lifecycle management, graceful shutdown, connection counters, byte counters, timeouts, and low-copy stream piping.
- Dynamic plugin modules under the `plugin.*` type namespace.
- Remote plugin outbound factory RPC for isolated worker-thread and child-process plugins.
- WASM extension loading for controlled runtime extension points.
- Worker thread pool for CPU-oriented control-plane tasks.
- Routing policies with round-robin, least-latency, failover health, and per-outbound latency records.
- Config and rule-set hot reload for route/outbound/policy updates.
- TCP connection pool primitive for reusable control-plane streams.
- QUIC transport interface with a clear runtime capability boundary.
- Explicit zero-copy relay helper built on Node stream piping.
- Self-contained benchmark tool that starts a local sepigs engine and echo server.
- Resumable full soak runner with checkpoint, JSONL metrics, markdown summaries, and connection dumps.
- Prometheus metrics plus sample alert rules and Grafana dashboard.

## Install

```sh
npm install
```

## Run

```sh
npm run build
npm start
```

By default `npm start` loads `examples/sepigs.json`, listens on `127.0.0.1:8080` for HTTP proxy traffic, and listens on `127.0.0.1:1080` for SOCKS5.

You can also pass a config path directly:

```sh
node dist/src/index.js /path/to/sepigs.json
```

YAML configs are also supported:

```sh
node dist/src/index.js examples/sepigs.yaml
```

## Test And Check

```sh
npm run build
npm test
npm run lint
npm run typecheck
npm run benchmark
npm run benchmark:udp
npm run benchmark:gate
npm run docs:check
npm run sub:dry-run
npm run web:build
npm run security:check
```

Restricted CI or sandbox environments can pin all validation listeners to IPv4 loopback and request ephemeral ports:

```bash
SEPIGS_TEST_HOST=127.0.0.1 SEPIGS_TEST_PORT=0 SEPIGS_DISABLE_IPV6=1 npm run benchmark
```

The same variables apply to soak commands. `npm run validation:bind` diagnoses listen permission; `npm run validation:no-listen` exercises pure logic only and does not replace network validation.

## Example Clients

HTTP proxy:

```sh
curl -x http://127.0.0.1:8080 http://example.com/
```

SOCKS5:

```sh
curl --socks5-hostname 127.0.0.1:1080 http://example.com/
```

## Benchmark

The benchmark tool starts a local sepigs engine and TCP echo target, then runs 100, 500, 1000, and 5000 connection pressure levels:

```sh
npm run benchmark
```

Reports are written to `bench/results/latest.json` and `bench/results/latest.md`. Use `--max-active` to raise the active socket cap on machines with a higher file descriptor limit.

The UDP benchmark writes `bench/results/udp-latest.*`; `npm run benchmark:gate` compares both transports against the checked-in beta thresholds.

## Soak

Short soak:

```sh
npm run soak:short
```

One-hour resumable soak:

```sh
npm run soak:1h:full
```

Resume a run:

```sh
npm run soak:resume
```

Prepare a resumable 24-hour run:

```sh
npm run soak:24h
```

The beta mixed-workload gate runs for 30 minutes:

```sh
npm run soak:gate
```

Real-client sign-off worksheets are under `verification/`. Unsigned worksheets are not compatibility claims.

## Not Supported Yet

- TLS termination.
- TUN mode.
- Native WireGuard forwarding.
- GUI/mobile clients are ready for manual verification but not automatically verified.
- Remote plugin stream transforms across process boundaries.
- Full in-process WireGuard packet tunnel transport.
- Native QUIC/Hysteria-style transport implementation without an external plugin.
