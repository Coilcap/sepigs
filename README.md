# sepigs

sepigs is a small TypeScript/Node.js proxy core for legal personal proxying, local forwarding, learning, and self-hosted services. The first version focuses on a stable architecture instead of many protocols.

## Features

- HTTP proxy inbound with `CONNECT` and basic absolute-form HTTP forwarding.
- SOCKS5 inbound with no-auth `CONNECT` and optional UDP ASSOCIATE relay.
- `direct`, `block`, fixed-target `tcpRelay`, Shadowsocks, Trojan, and WireGuard outbounds.
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
- WASM extension loading for controlled runtime extension points.
- Worker thread pool for CPU-oriented control-plane tasks.
- Routing policies with round-robin, least-latency, failover health, and per-outbound latency records.
- Config and rule-set hot reload for route/outbound/policy updates.
- TCP connection pool primitive for reusable control-plane streams.
- QUIC transport interface with a clear runtime capability boundary.
- Explicit zero-copy relay helper built on Node stream piping.
- Self-contained benchmark tool that starts a local sepigs engine and echo server.

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
```

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

## Not Supported Yet

- Authentication.
- TLS termination.
- TUN mode.
- Remote subscription parsing.
- Full in-process WireGuard packet tunnel transport.
- Native QUIC/Hysteria-style transport implementation without an external plugin.
