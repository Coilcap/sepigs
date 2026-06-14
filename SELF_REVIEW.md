# SELF REVIEW

## Stage 1 - Project Skeleton

Completed:
- Created a TypeScript ESM project with strict compiler settings, ESLint, Node test scripts, and a modular source tree.
- Added base config, logger, errors, protocol types, lifecycle, stats, TCP helpers, and outbound interfaces.

Found:
- The buffered socket reader could spin when a partial protocol frame was buffered but no new bytes were available.

Fixed:
- Changed the reader pull loop to wait for new readable data unless fresh bytes were appended.

Remaining risk:
- ESLint and TypeScript may still reveal strictness issues after dependency installation.

Next:
- Compile and run focused tests after all modules are in place.

## Stage 2 - Router And Config

Completed:
- Added JSON config parsing, defaults, reference validation, and route rule compilation.
- Implemented exact domain, suffix, IPv4/IPv6 CIDR, port, default, and block-by-outbound routing.

Found:
- Numeric validation needed explicit `typeof value === "number"` checks for strict TypeScript.

Fixed:
- Tightened numeric guards in config schema.

Remaining risk:
- IPv6 CIDR parser needs more edge-case tests before claiming full production coverage.

Next:
- Exercise router and config through automated tests.

## Stage 3 - Outbounds

Completed:
- Implemented direct, block, and tcpRelay outbounds with connect timeouts and typed block errors.

Found:
- Outbounds should avoid owning long-lived sockets after returning them to inbound pipe management.

Fixed:
- Kept outbound responsibility limited to connection establishment.

Remaining risk:
- More outbound-level metrics may be useful in later releases.

Next:
- Validate each outbound against local TCP echo servers.

## Stage 4 - HTTP Inbound

Completed:
- Implemented HTTP CONNECT and basic absolute-form HTTP forwarding.
- Added proxy header stripping and clear 400/403/502 responses.

Found:
- The first pass did not include source socket information in HTTP `ProxyRequest`.

Fixed:
- Added source extraction from the accepted client socket.

Remaining risk:
- HTTP request forwarding is intentionally basic and does not yet rewrite every hop-by-hop header variant.

Next:
- Test CONNECT, forwarding, and close accounting.

## Stage 5 - SOCKS5 Inbound

Completed:
- Implemented SOCKS5 no-auth negotiation and CONNECT for IPv4, IPv6, and domain address forms.
- Added UDP ASSOCIATE reserved handling with a protocol-level rejection.

Found:
- The reader must preserve any extra bytes sent after the SOCKS5 request.

Fixed:
- Released buffered remainder into the remote socket after successful connect.

Remaining risk:
- UDP ASSOCIATE is explicitly not implemented yet.

Next:
- Test handshake and tunnel echo behavior.

## Stage 6 - Engine Integration

Completed:
- Integrated config, router, inbound startup, outbound selection, stats, and graceful shutdown.

Found:
- Engine startup needs to stop partial services if an inbound fails to bind.

Fixed:
- Startup wraps inbound start in a stop-on-failure path.

Remaining risk:
- Graceful shutdown currently destroys active sockets through inbound stop; later releases can add drain policies.

Next:
- Run build, tests, lint, and typecheck; then fix every failure.

## Stage 7 - Final Verification

Completed:
- Ran `npm run build`, `npm test`, `npm run lint`, and `npm run typecheck`.
- Verified config parsing, routing, HTTP CONNECT, HTTP forwarding, SOCKS5 CONNECT, all outbounds, and connection close accounting.

Found:
- The normal sandbox blocked local `127.0.0.1` listener tests with `EPERM`.
- ESLint required explicit `void test(...)` registration and block-bodied callbacks for void-returning functions.

Fixed:
- Re-ran socket integration tests with local listener permission.
- Tightened lint-safe callback bodies, rejected Promise paths, and test registration.

Remaining risk:
- UDP, authentication, advanced HTTP proxy behavior, and additional proxy protocols remain future work by design.
- IPv6 CIDR matching is implemented but should receive broader fixture coverage in the next stage.

Next:
- Add YAML/rule-set support and the first encrypted outbound protocol behind the existing outbound abstraction.

## Stage 8 - Config, Rule-Sets, UDP, Benchmark

Completed:
- Added YAML config support using the `yaml` package.
- Added `route.ruleSetFiles` and load-time expansion of JSON/YAML rule-set files.
- Added SOCKS5 UDP ASSOCIATE relay guarded by `udpAssociate: true`.
- Added direct UDP outbound support with bounded response timeout and UDP packet/byte stats.
- Added `npm run benchmark` for HTTP CONNECT echo benchmarking.
- Added examples for YAML config and rule-set files.

Found:
- Rule-set loading needed to stay out of the runtime router hot path.
- SOCKS5 UDP needed a control-connection lifetime model so UDP sockets are not left open after TCP close.
- The benchmark script needed to be part of `tsconfig` so it receives the same type scrutiny as `src` and `test`.

Fixed:
- Rule-set files are expanded by `loadConfig` before `Engine` constructs the router.
- UDP relay sockets are per association and close on control socket close, error, end, or idle timeout.
- Added UDP integration tests with a real local UDP echo server.

Remaining risk:
- Direct UDP is currently request/response oriented and opens an ephemeral socket per packet.
- SOCKS5 UDP fragmentation is intentionally rejected.
- Encrypted outbounds such as Shadowsocks/Trojan/VLESS are still pending and should be implemented with dedicated stream abstractions.

Next:
- Build a generic duplex stream wrapper for encrypted TCP outbounds, then implement Shadowsocks outbound with focused interoperability tests.

## Stage 9 - Stability Hardening

Completed:
- Added `ConnectionManager` with active connection registry, byte accounting, destination tracking, forced close, and close reasons.
- Added `ResourceLimiter` with configurable `limits.maxConnections` and rejection stats.
- Added `TimeoutManager` and tracked connection timers for handshake and idle recycling.
- Added `LeakDetector` for tracked sockets, timers, and listener counts.
- Enhanced statistics with rejected connections, total bytes, uptime, average connection duration, and failure rate.
- Added stability and fault-injection tests for forced close, max connection rejection, partial packet timeout, DNS failure, broken pipe, and shutdown cleanup.
- Reworked benchmark into `bench/benchmark.ts` with local engine startup and 100/500/1000/5000 target levels.

Found:
- `.invalid` DNS behavior was not stable in the local environment because the network resolved it unexpectedly.
- Leak detector socket tracking also needed to release emitter tracking to avoid self-inflicted false positives.
- Existing benchmark instructions assumed an already running proxy and echo server, which was not suitable for repeatable CI-style runs.

Fixed:
- Replaced DNS fault injection with `bad..host`, which Node resolves locally to `ENOTFOUND`.
- Coupled socket and emitter cleanup inside `LeakDetector.trackSocket`.
- Made `npm run benchmark` self-contained and report to `bench/results/latest.md`.

Remaining risk:
- Benchmark 5000 target uses a default `--max-active 128` cap for local file-descriptor safety; true 5000 simultaneous sockets should be validated on a tuned host.
- Leak detection tracks sepigs-managed sockets and timers, not every internal Node timer created by dependencies.
- Long soak testing over multiple days is still needed before claiming multi-week production behavior.

Next:
- Add a soak-test mode that runs for hours with periodic fault injection and trend reports.
- Add optional Prometheus-style text metrics output without a dashboard.
- Add CPU-prof and heap-snapshot benchmark modes for deeper production profiling.

## Stage 10 - Multi-Protocol Kernel

Completed:
- Added inbound and outbound factory registries so Engine no longer has protocol-specific switch logic.
- Added a shared `TcpStream` abstraction so native sockets and protocol-wrapped streams use one pipe path.
- Implemented Shadowsocks AEAD outbound for `aes-128-gcm`, `aes-256-gcm`, and `chacha20-ietf-poly1305`, including UDP packet crypto.
- Implemented Trojan outbound with TLS support and plain TCP test mode.
- Added WireGuard outbound config validation and a clear capability-boundary error for traffic until packet tunnel transport exists.
- Added DNS resolver with hosts, cache TTL, and family strategy.
- Added GeoIP/GeoSite config expansion into ordinary router rules.
- Added subscription parser for `ss://`, `trojan://`, `wireguard://`, JSON, and YAML outbound lists.
- Added end-to-end tests for Shadowsocks and Trojan through the existing HTTP inbound and router path.

Found:
- Outbound protocols that wrap streams needed a generic `TcpStream`; returning only `net.Socket` would force protocol-specific handling.
- Shadowsocks AEAD stream decrypt state cannot consume a nonce for a length block and then roll it back if payload bytes are incomplete.
- WireGuard cannot honestly be implemented as a TCP stream outbound without a packet tunnel transport.

Fixed:
- Generalized the pipe and connection manager path to `TcpStream`.
- Reworked Shadowsocks decrypt parsing to track pending payload length.
- Registered WireGuard as an outbound with explicit errors for unsupported stream/relay operations.

Remaining risk:
- Shadowsocks tests use a local mock server; interoperability against external implementations should be added.
- Trojan TLS is implemented, but tests use plain mode to avoid certificate fixture complexity.
- WireGuard still needs a real packet tunnel transport before it can carry traffic.

Next:
- Add external interoperability fixtures for Shadowsocks/Trojan.
- Implement a packet transport layer before activating WireGuard traffic.
- Add subscription-to-config generation CLI.

## Stage 11 - Next Runtime Kernel

Completed:
- Added dynamic ESM plugin loading with `plugin.*` inbound/outbound type support through the existing registries.
- Added WASM extension loading and typed exported-function access.
- Added a Worker Threads pool for CPU-oriented extension/control-plane tasks.
- Added a QUIC transport interface with a clear unavailable default implementation.
- Extracted zero-copy stream relay into `transport/zeroCopy.ts`.
- Added a bounded TCP connection pool primitive.
- Added routing policies for round-robin, least-latency ordering, failover health, and automatic retry of outbound candidates.
- Added config and rule-set hot reload via a debounced watcher plus `Engine.reloadConfig`.
- Added tests for plugin loading, WASM, worker pool, connection pool, QUIC boundary, policy selection, failover, and hot reload.

Found:
- Engine component construction had to move from the constructor to `start()` so plugins can register factories before `plugin.*` configs are instantiated.
- Latency recording must measure the real outbound connection once; a separate probe must not open a duplicate stream on the data path.
- Node's default TypeScript lib in this project does not expose the `WebAssembly` namespace, so the WASM manager needs a local minimal runtime type.
- Hot reloading inbounds would close active sockets with the current inbound stop model, so runtime reload is scoped to route/outbound/DNS/policy-style updates.

Fixed:
- Made plugin and WASM managers idempotently load newly added entries while skipping existing tags.
- Kept router matching unchanged and moved policy expansion into `RoutingPolicyManager`.
- Added failover in `Engine.openTcp` and `sendUdp` without adding protocol-specific conditions.
- Added tests that prove old behavior still passes alongside Next runtime features.

Remaining risk:
- QUIC is an interface boundary, not a native QUIC implementation yet.
- Connection pool is intentionally not used for active proxy tunnels, because generic TCP tunnels are not safely reusable after arbitrary traffic.
- Hot reload does not restart inbound listeners; changing listen addresses or ports still needs a process restart or a future drain-and-rebind workflow.
- Background active probing is represented by the `LatencyProbe` utility, but scheduled probes are still future work.

Next:
- Add configurable background health probes with jitter and probe budgets.
- Add plugin examples and a stricter plugin compatibility manifest.
- Add a drain-and-rebind path for inbound hot reload.
- Add native QUIC/Hysteria2 transport implementation behind the existing transport interface.
