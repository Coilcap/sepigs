# SELF REVIEW

## Phase 8.5 - Validation Gap Closure

Completed: added loopback-only test host/port parsing, IPv4 forcing, a bind probe, and a no-listen fallback. Benchmark completed 6,600/6,600 connections, soak matrix verified 7/7 scenarios, and the ten-minute soak completed 19,064/19,064 requests with zero errors and final tracked resources at zero.

Found: restricted execution denied even `127.0.0.1:0` with `EPERM`, while the identical out-of-sandbox probe succeeded. The failure was sandbox policy, not port range, address family, public binding, reuse, or sepigs configuration.

Fixed: benchmark, legacy/full soak, matrix helpers, and test fixtures now honor `SEPIGS_TEST_HOST`, `SEPIGS_TEST_PORT`, and `SEPIGS_DISABLE_IPV6`. Temporary 24h artifacts are ignored and a historical absolute workspace path was redacted.

Remaining risk: benchmark caps effective concurrency at 128; full 24-hour soak and external protocol/client sign-off remain pending.

## Phase 8 - Feature Expansion

Completed: bounded UDP lifecycle and metrics; fake-IP reverse routing; bounded DNS cache; subscription formats; authenticated Dashboard API; minimal Web build; Shadowsocks/Trojan TCP inbounds; and explicit TUN/QUIC/WireGuard experimental boundaries.

Found and fixed: full fake-IP pools could not reuse an LRU address; required new config fields broke RC1 fixtures; reload retained lifecycle/plugin registrations. Defaults are now backward-compatible, full pools evict before reuse, shutdown timers are cleared, and plugin factories are owner-scoped and unloaded.

Remaining risk: external Shadowsocks/Trojan sign-off, native packet transports, fragmented Shadowsocks buffer-copy cost, and a full 24-hour soak.

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

## Stage 12 - Phase 5 Production Hardening

Completed:
- Audited Phase 1-4 runtime modules and documented real, experimental, and reserved boundaries in `docs/reality-check.md`.
- Added inbound drain-and-rebind hot reload with rollback when the replacement listener fails to start.
- Added optional HTTP Basic Auth and SOCKS5 username/password authentication with focused success/failure tests.
- Added active outbound probing primitives with latency, jitter, failure-rate tracking, probe budget, timeout, max concurrency, and exponential backoff.
- Strengthened DNS with UDP A-record resolution, TTL cache behavior, DNS route rules, and fallback host handling.
- Added plugin manifests, API-version validation, permission validation, sandboxed registration APIs, and three example plugin packages.
- Added an explicit QUIC adapter boundary with unsupported, missing-dependency, and mock-adapter test coverage.
- Added profiling tools for CPU profiles, heap snapshots, event-loop delay, and GC observation.
- Added a 10-minute short soak runner that exercises HTTP CONNECT, SOCKS5 CONNECT, direct outbound, block behavior, route changes, and hot reload under continuous requests.
- Added release engineering files, security documentation, hot-reload documentation, plugin documentation, DNS documentation, policy documentation, client-compatibility notes, and profiling documentation.

Found:
- QUIC/Hysteria2 could not honestly be labeled native in the current Node.js environment without a stable QUIC dependency, so the implementation is an adapter boundary rather than a full transport.
- The existing plugin loader needed a compatibility manifest so examples and third-party modules can be validated before executing setup code.
- Inbound hot reload had to start the replacement listener before draining the old listener; otherwise a bad reload could take the proxy offline.
- Authentication needed to be optional and off by default to preserve existing local development configs while allowing safe exposed deployments.
- The first soak loop could overrun the local machine's ephemeral port/TIME_WAIT behavior; the runner now uses bounded workers, task timeouts, configurable per-worker pacing, error reason aggregation, and non-zero exit status for unexpected errors.
- Benchmark latency measured after a long local soak can be dominated by host TCP port pressure, so benchmark interpretation must include host-condition context.

Fixed:
- Added rollback semantics for failed inbound reloads and retained active old connections during a successful drain.
- Added clear 407 responses for HTTP proxy auth failures and SOCKS5 RFC 1929 rejection paths for invalid credentials.
- Added final after-stop soak leak samples so a transient runner timer is not mistaken for a retained runtime timer.
- Added an explicit short-soak worker delay so the 10-minute test validates long-running behavior instead of saturating the host ephemeral port table.
- Added tests for DNS fallback, UDP DNS cache hits, plugin manifest validation, plugin permission denial, QUIC adapter errors, active probing, inbound reload, and proxy authentication.
- Updated CI/release workflows to run install, lint, typecheck, test, and build before publishing.

Remaining risk:
- Native QUIC/Hysteria2 is not implemented; only the adapter and research boundary are present.
- DoH and fake-ip remain documented DNS architecture reservations.
- Plugin sandboxing restricts sepigs API access but plugins still execute in-process JavaScript.
- Real GUI clients such as Chrome, Mihomo, Shadowrocket, NekoBox, and v2rayN are documented for compatibility testing but not manually verified in this environment.
- Multi-hour and multi-week soak behavior still needs to run on the intended deployment host with tuned file-descriptor and TCP settings.

Next:
- Run the standard 1-hour soak and a 6-hour host soak before a production tag.
- Add optional metrics export for connection, leak, DNS, and prober state.
- Evaluate a maintained QUIC dependency before promoting the adapter into a real native transport.
- Move untrusted plugin execution into a stronger process/worker isolation model.

## Stage 13 - Phase 6 Real-World Interop + Observability + Isolation

Completed:
- Added Prometheus metrics server with graceful shutdown, event-loop delay, GC, memory, leak, connection, DNS, route, outbound, and hot-reload metrics.
- Added DoH POST resolver support with local mock-server tests, timeout, fallback, TTL cache, multiple upstream attempts, and failure counting through stats.
- Added config versioning with v0-to-v1 migration warnings and future-version rejection.
- Added plugin isolation runners for in-process, worker-thread, and child-process modes.
- Added isolated plugin fixtures for echo, crash, and timeout behavior.
- Added real interop tooling for curl HTTP, curl SOCKS5, HTTP Basic Auth, SOCKS5 username/password, Node CONNECT, and local upstream servers.
- Added outbound-only Shadowsocks/Trojan compatibility tests with local reference servers and explicit documentation of unverified external clients.
- Upgraded soak commands for 1h, 6h, matrix, environment/configurable durations, resource samples, FD count, GC pressure, reload count, and failover count.
- Added release dry-run and pack scripts with filtered artifacts, MIT license, and release artifact documentation.
- Added safe local and public-auth-required config examples.

Found:
- The first release dry-run included compiled tests under `dist/test`; packaging now excludes those paths.
- `soak:6h` initially hard-coded duration/concurrency in the npm script, preventing environment overrides; defaults now come from profile parsing and can be overridden.
- The interop report initially used authenticated ports for the plain curl rows; open and authenticated inbounds are now separated.
- The matrix hot-reload scenario accidentally changed the inbound port and correctly triggered rollback; it now tests route reload without changing inbound listeners.

Fixed:
- All Phase 6 additions are covered by automated tests or executable smoke tools.
- DoH uses a local mock server for repeatable tests and never depends on public DNS.
- Plugin crashes and timeouts are contained by worker/process runners and reported as errors.
- Release dry-run excludes `node_modules`, `test`, `dist/test`, `profiles`, and `.DS_Store`.

Remaining risk:
- Isolated plugins cannot register runtime factories yet; only lifecycle and `handle(payload)` style calls are supported outside in-process mode.
- GUI/mobile client compatibility remains not verified in this environment.
- Shadowsocks/Trojan compatibility is outbound-only against local fixtures, not broad external ecosystem certification.
- Full 1-hour and 6-hour soak commands are implemented, but only smoke-mode runs were executed in this session.

Next:
- Run full 1-hour and 6-hour soak on a tuned host before a production tag.
- Add remote plugin factory RPC if untrusted third-party protocol plugins are required.
- Add Prometheus alert rules and a richer Grafana dashboard after observing production baselines.
- Run manual Chrome/Mihomo/Shadowrocket/NekoBox/v2rayN/Surge/Stash compatibility tests.

## Stage 14 - Phase 7 Full Soak And Compatibility

Completed:
- Added resumable full soak runner with checkpoint, JSONL metrics, markdown summaries, failure samples, SIGINT handling, final connection dump, and report merge.
- Added generated client configs for Chrome/system proxy, Mihomo, Shadowrocket, NekoBox, v2rayN, Surge, and Stash with manual verification checklists.
- Added external protocol compatibility matrix tooling that separates local fixtures from missing external reference implementations.
- Added Prometheus alert rules, Grafana panels, alert rule tests, and docs.
- Implemented remote plugin outbound factory RPC for worker-thread and child-process plugins without passing socket handles.
- Added plugin RPC examples, docs, and tests.
- Added security regression tests for public listener rejection, auth behavior, plugin permission denial, future config rejection, and child-process crash containment.
- Added `docs:check` for npm script references, markdown links, and example config schema validation.

Found:
- Isolated plugin setup failures could leave a worker alive because the runner was not yet in the loaded-plugin list.
- The remote block plugin correctly maps to HTTP 403 through existing typed block behavior, not 502.
- `tsx` requires a local IPC pipe in this desktop sandbox, so project scripts need escalated execution when the sandbox rejects pipe creation.

Fixed:
- `PluginManager.loadOne()` now stops the runner if setup fails.
- Updated plugin RPC test expectations to match block semantics.
- Tightened public listener validation so unauthenticated public HTTP/SOCKS inbounds and public metrics listeners are rejected.

Remaining risk:
- External Shadowsocks/Trojan implementations were not installed locally, so external compatibility remains `skipped-with-reason`.
- GUI/mobile clients cannot be truthfully marked verified until a human imports the generated configs.
- Remote plugin RPC is intentionally control-plane only; remote stream transforms and UDP factories remain unsupported.

Next:
- Run the full six-hour soak on the intended deployment host and complete manual/external client interoperability verification before a production-stable claim.

Final verification:
- Clean 1h full soak passed with 456,990/456,990 operations, zero errors, zero infrastructure pauses, and final sockets/timers/listeners at 0/0/0.
- 6h profile 10-minute substitute passed with 101,849/101,849 operations and zero errors; full six-hour execution remains pending.
- Short soak passed with 19,040/19,040 operations.
- Lint, typecheck, 65 tests, build, benchmark, release dry-run, and docs check all passed.

## Stage 15 - Beta And RC1 Readiness

Completed:
- Added six real-client acceptance worksheets with reproducible config/import/test/rollback steps and unsigned acceptance tables.
- Added beta readiness, RC1 release notes, technical debt audit, and Reality Check v2.
- Added a tested 24-hour soak profile using the existing checkpoint/resume/report infrastructure without executing a 24-hour run.
- Promoted package metadata to `0.1.0-rc1` without adding protocols or data-plane capabilities.

Found:
- Documentation checks did not originally scan `verification/` or require the beta/RC1 documents.
- Release packaging omitted `release-notes.md`, `CONTRIBUTING.md`, and client verification worksheets.
- `tsx` CLI IPC can fail in restricted environments even for read-only release checks.

Fixed:
- Expanded docs checks to cover 49 markdown files and require all beta/RC1 artifacts.
- Added RC1 notes and verification worksheets to release packaging; dry-run now includes 325 files.
- Moved docs and release dry-run scripts to `node --import tsx` to avoid CLI IPC.

Remaining risk:
- Real GUI/mobile acceptance rows are unsigned.
- The full 24-hour soak and external Shadowsocks/Trojan reference tests are not executed.
- High-priority lifecycle, plugin ownership, DNS cache, and buffer-copy debts remain documented rather than refactored.

Final verification:
- Lint, typecheck, 66 tests, build, docs check, client config validation, 24h-profile smoke, and RC1 release dry-run passed.
- Development stops at RC1 readiness; Phase 8 is not started.

## Stage 16 - Phase 9 v0.2.0 Beta Hardening

Completed:
- Added UDP load, timeout, limit, block, reload, fake-IP, metrics, benchmark, and cleanup coverage.
- Added fake-IP lifecycle, persistence, cache-isolation, router, TCP/UDP, and compatible-reload validation.
- Added Dashboard rate-limit, redaction, reload containment, and targeted connection-kill regression tests.
- Added subscription malformed-input, de-duplication, mixed-format, and reusable redaction coverage.
- Added external reference binary detection, a self-validating manual client pack, performance/soak/security/release gates, and beta release documents.

Found:
- Direct UDP bypassed the configured DNS resolver, breaking fake-IP UDP destinations.
- Compatible route reloads recreated fake-IP state and restarted unchanged Dashboard/metrics listeners.
- The original two-second soak probe timeout produced false failures under sustained local scheduling pressure.
- The 30-minute mixed gate still concentrated 239 recoverable read timeouts in fake-IP CONNECT during reload pressure.
- GitHub publication is blocked because HTTPS credentials lack workflow scope and SSH has no accepted key.

Fixed:
- Direct UDP now resolves through the configured resolver; compatible fake-IP mappings survive reload.
- Route-only reloads keep unchanged Dashboard and metrics listeners bound.
- The soak probe window is separated from the runtime idle timeout and errors are labeled by request path.
- README, Roadmap, RELEASE, technical debt, manual verification, and docs gates now describe the beta boundary consistently.

Remaining risk:
- External Shadowsocks/Trojan reference runs and GUI/mobile sign-off remain unverified.
- Full 24-hour host soak is not executed; fake-IP reload pressure needs longer profiling.
- Cross-component config reload is not one atomic transaction.
- Web Dashboard, Shadowsocks/Trojan inbounds, TUN mock, QUIC boundary, and WireGuard adapter remain experimental; native packet transports remain unsupported.

Next:
- Restore repository publication credentials, run the existing 24-hour soak, complete signed client/reference compatibility, and make cross-component reload transactional before a stable release.

## Stage 17 - Phase 10 v0.2.0-beta Release Closure

Completed:
- Bumped package metadata to `0.2.0-beta.0` without adding protocols or data-plane features.
- Added release-closure checklist, beta security summary, transactional reload design notes, a beta-specific 24-hour soak status report, and client sign-off worksheets for Chrome/system proxy and Clash Verge.
- Ran a two-hour checkpointed segment of the `24h` soak profile with 1,220,350/1,220,350 successes, zero errors, 1,440 reloads, and final sockets/timers/listeners at 0/0/0.
- Re-ran the Phase 10 local validation matrix: lint, typecheck, 105 tests, build, Web build, subscription dry-run, TCP/UDP benchmarks, benchmark gate, short soak, 30-minute soak gate, docs check, security check, verification pack, external compatibility detector, and release dry-runs.

Found:
- Publishing remains blocked by repository credentials: HTTPS OAuth lacks `workflow` scope for workflow files, and SSH authentication fails with `Permission denied (publickey)`.
- The 30-minute mixed gate still concentrates recoverable failures in fake-IP CONNECT during reload pressure and recorded one Dashboard metrics `ECONNRESET`.
- GUI/mobile client rows and external Shadowsocks/Trojan reference tests remain unsigned or skipped with explicit missing-binary reasons.

Fixed:
- Updated beta readiness, release notes, and release checklist with the current Phase 10 gate data instead of stale Phase 9 figures.
- Release dry-run now documents that workflow files are repository-only automation and excluded from runtime artifacts.
- External compatibility output now writes beta-specific reports while keeping skipped reference results separate from local fixture coverage.

Remaining risk:
- Full 24-hour soak is still pending; only a two-hour segment of the 24-hour profile has been executed.
- Public beta publication and tag creation are blocked until `main` can be pushed to `origin`.
- Cross-component reload is not transactional yet; the design is documented for a later phase but not implemented here.

Next:
- Repair GitHub credentials, push `main`, then create/push the beta tag only after confirming `origin/main` contains this release-closure commit.
- Complete human client sign-off and external reference implementation compatibility before making a production-stable claim.

## Stage 18 - Phase 12 M1 External Compatibility Harness

Completed:
- Added reference detection with executable, version, platform, architecture, and install-hint evidence.
- Added loopback-only temporary config generators for shadowsocks-rust, shadowsocks-libev, sing-box, Xray, and Trojan-Go.
- Added a bounded external process runner with readiness, crash containment, graceful stop, force-kill fallback, port cleanup checks, and capped logs.
- Added real Shadowsocks and Trojan client/server interoperability cases plus per-case reproduction and combined reports.

Found:
- Xray can acknowledge its local SOCKS CONNECT before the remote Trojan tunnel is fully settled; sending the full 1 MiB as the first application write caused a deterministic reset.
- External process logs and commands could expose system temporary paths in retained evidence.
- Trojan tests use an ephemeral self-signed certificate, so encrypted interoperability must not be described as public-PKI verification.
- The `tsx` CLI opened an IPC socket even for report-only commands and failed with `listen EPERM` in a restricted environment.
- A missing command with no readiness callback could emit its asynchronous spawn error after the runner had already returned ready.

Fixed:
- Large payload verification now confirms a small exchange first, then asserts the complete 1 MiB payload over the established tunnel.
- Retained evidence redacts test-only secrets and replaces system temporary paths with `<system-temp>`.
- Documentation and case reasons state the self-signed certificate and trust boundary explicitly.
- New npm entries use `node --import tsx`, matching existing sandbox-safe project scripts and avoiding the CLI IPC server.
- Process readiness now waits for Node's successful `spawn` event, and a missing-command regression test verifies contained failure and bounded teardown.

Remaining risk:
- shadowsocks-rust, shadowsocks-libev, and trojan-go are absent, leaving 28 cases skipped.
- Binary path and version are captured, but digest/provenance enforcement remains an M2 supply-chain gate.
- Process-group cleanup has automated local coverage but still needs CI/platform variance evidence.

Next:
- In M2, install pinned missing references, add digest/provenance gates, and rerun skipped cases without changing protocol core behavior.

## Stage 19 - Phase 13 M2 Compatibility Evidence Expansion

Completed:
- Added redacted binary fingerprints with SHA-256, file metadata, source classification, and symlink resolution.
- Added Xray Shadowsocks bidirectional cases plus sing-box/Xray remote-close and sing-box 8-connection concurrency cases.
- Added implementation-specific reports, a version/count regression gate, and a self-auditing evidence ZIP.
- Extended security checks to compatibility reports, teardown evidence, bounded excerpts, and ZIP entries.

Found:
- The first remote-close scenario waited without writing, so Shadowsocks never emitted its destination header and the reference server never opened the target connection.
- Existing beta-era compatibility reports retained local Homebrew paths.
- A detected Homebrew command can be a wrapper or symlink, so the fingerprint report must retain the resolved entry path and source trust limitation.

Fixed:
- Remote-close cases send a recorded probe payload before waiting for closure; both sing-box and Xray cases then pass.
- Historical paths were tokenized without changing their compatibility conclusions.
- Evidence reports distinguish a reproducible local digest from upstream provenance or signature trust.
- Wrapper launchers and their resolved execution targets are fingerprinted separately so a small package-manager shim cannot stand in for the executed payload.

Remaining risk:
- shadowsocks-rust, shadowsocks-libev, and Trojan-Go remain absent, leaving 28 cases skipped.
- Homebrew automatic upgrades can invalidate a fingerprint and require a complete rerun.
- Public-PKI Trojan validation and unsupported transport/protocol extensions remain outside M2.

Next:
- Review and safely install pinned missing reference implementations before expanding verified coverage.
- Do not begin transactional reload implementation until M2 validation and evidence review are complete.
