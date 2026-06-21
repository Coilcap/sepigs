# Technical Debt Audit

Scope updated for Phase 8 (`v0.2.0-alpha.0`).

## Resolved In Phase 8

- Lifecycle unregister and successful-shutdown timeout cleanup.
- Owner-scoped plugin outbound registration and unregister on unload/crash/config replacement.
- DNS bounded LRU, negative cache, and single-flight queries.
- SOCKS5 UDP parsing moved to a dedicated module; UDP lifecycle is centrally bounded.

## High Priority

| Area | Debt | Risk | Recommended Resolution |
| --- | --- | --- | --- |
| Plugin RPC tests | Registration and runner crash containment are tested separately, not as one post-registration crash scenario. | A regression could leave a remote factory registered after its runner exits. | Add an integration test that registers, crashes, verifies unregister, and confirms core continuity. |
| Plugin reload | `PluginManager.loadAll` skips an existing tag but does not unload removed or changed modules. | Hot reload may keep obsolete plugin code and permissions active. | Diff desired/loaded manifests and perform bounded stop/unregister/reload. |
| External compatibility | Shadowsocks/Trojan tests use local fixtures only. | Real clients may expose framing, TLS, close, and large-payload differences. | Run pinned external reference implementations in isolated CI jobs. |

## Refactoring Candidates

| Module | Finding | Direction |
| --- | --- | --- |
| `src/config/schema.ts` | Large parser combines defaults, field parsing, cross-reference checks, and security policy. | Split by config domain and keep a small root assembler. |
| DNS subsystem | System, UDP, and DoH selection/cache/fallback live in one resolver class. | Introduce resolver strategy interfaces plus shared bounded cache/single-flight layer. |
| Plugin hosts | Worker-thread and child-process hosts duplicate protocol guards, context creation, and lifecycle dispatch. | Share a transport-neutral host dispatcher. |
| Plugin runners | Worker and child runners duplicate pending-call, timeout, output-budget, and rejection logic. | Extract a typed RPC pending-call controller. |
| Inbounds | HTTP and SOCKS repeat listener bind, socket-set ownership, drain, and stop behavior. | Extract a tested listener lifecycle helper without moving protocol parsing. |
| Soak tooling | Legacy `test/soak/soak.ts` and `src/soak/runner.ts` duplicate HTTP/SOCKS client operations. | Reuse one scenario library while preserving legacy report format. |
| Test fixtures | Shadowsocks/Trojan fixtures duplicate target parsing and TCP relay setup. | Add a small test-only reference relay helper. |

## Potential Performance Issues

- Incremental parsers use repeated `Buffer.concat` in HTTP/SOCKS test clients, protocol fixtures, and Shadowsocks decrypt buffering. Large fragmented streams can cause extra copies and quadratic behavior.
- Shadowsocks stream decryption still compacts fragmented encrypted data with repeated `Buffer.concat`; benchmark before replacing it with a chunk queue.
- Soak checkpoint latency samples are bounded to 100,000 values but still create multi-megabyte local checkpoint files; Git ignores them, but long-run disk writes remain measurable.
- Prometheus rendering rebuilds the complete text payload on every scrape and exposes no cached snapshot interval.
- Routing policy health and metrics are process-local; large outbound sets use linear scans and lack persistence across restart.
- True 5,000 simultaneous-socket behavior is unmeasured because the benchmark uses an effective concurrency cap of 128.

## Potential Security Issues

- HTTP Basic Auth and SOCKS username/password protect proxy access but do not encrypt credentials or traffic; exposed listeners require a trusted network or external TLS/VPN.
- Config files store credentials in plaintext and no automatic file-permission check is enforced.
- Metrics have no authentication. The schema rejects public metrics binding, but reverse-proxy deployments must enforce auth themselves.
- In-process plugins are trusted code. Worker threads isolate crashes/timeouts but not OS privileges; child processes still inherit environment and user permissions.
- Legacy plugins loaded without a manifest receive broad permissions and should be disabled for production packaging.
- Logs can include destination hostnames and operational metadata.
- Remote plugin RPC prevents socket-handle transfer, but outbound type collisions need owner-scoped registration.

## Test And Operations Gaps

- Full 24-hour soak is not executed.
- The six GUI/mobile client acceptance packets are unsigned.
- Full six-hour soak is not executed; only a 10-minute 6h-profile validation exists.
- IPv6, DNS malformed-packet fuzzing, slowloris-style fragmented headers, and high-cardinality DNS cache pressure need broader fixtures.
- CPU/heap profiling tools exist, but profiles are not generated as a release gate.

## Recommended Order

1. Fix lifecycle timer cleanup and unregister ownership.
2. Add plugin factory ownership and module unload/reload semantics.
3. Bound and de-duplicate DNS cache/query work.
4. Reduce incremental buffer copies in measured hot paths.
5. Complete real-client and external reference sign-off.
6. Execute 24-hour soak and higher-file-descriptor benchmark before production-stable status.
