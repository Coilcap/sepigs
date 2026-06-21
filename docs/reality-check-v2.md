# Reality Check v2

Scope: `v0.1.0-rc1`. Status labels describe the current implementation, not future intent.

## Production-Ready Components

| Module | Evidence | Boundary |
| --- | --- | --- |
| Route matchers | Exact domain, suffix, CIDR, port, default and block routing tests. | Deterministic in-memory matching only. |
| Block outbound | Typed TCP/UDP rejection tests. | No remote dependency. |
| Config validation/security guards | Clear schema errors, future-version rejection, public unauthenticated listener rejection. | Config version `1` only. |
| Metrics text renderer | Metric-name/alert consistency tests and secret checks. | Endpoint must remain local/protected. |
| Release validation tools | Build, lint, typecheck, docs check, benchmark and dry-run are repeatable. | Packaging does not imply production protocol compatibility. |

## Beta-Ready Components

| Module | Evidence | Remaining Beta Risk |
| --- | --- | --- |
| HTTP inbound | CONNECT, absolute-form forwarding, Basic Auth, close/resource tests. | No TLS termination; advanced HTTP edge cases are limited. |
| SOCKS5 inbound | CONNECT, username/password, UDP ASSOCIATE tests. | Fragmented UDP is rejected; real GUI sign-off pending. |
| direct/tcpRelay outbounds | Local TCP/UDP integration tests and soak coverage. | Internet-scale DNS/network diversity is not represented. |
| Connection/resource/timeout managers | Forced close, limiter, timeout, leak and shutdown tests. | 24-hour run pending. |
| Inbound reload | New-listener-first and rollback tests. | Same-address replacement cannot be fully atomic without socket activation. |
| Routing policy/health/prober | Budget, timeout, backoff, failover and latency tests. | Probe construction is not automatic for every outbound. |
| System/UDP DNS | Cache, TTL, routing and fallback tests. | Cache is unbounded and A-record focused. |
| Observability | Prometheus endpoint, alerts, event-loop, GC and resource metrics. | No authentication or histogram labels. |
| Plugin manifests/isolation | Permission, API version, crash, timeout and output-budget tests. | Not an OS sandbox; unload semantics need work. |
| Remote plugin outbound RPC | Worker registration, timeout, permission, direct and block tests; runner crashes are contained separately. | Control-plane decisions only; dedicated post-registration crash/unregister integration coverage is still needed. |
| Config/rule hot reload | File watcher and Engine reload tests. | Plugin removal/change handling is incomplete. |
| Soak infrastructure | Checkpoint/resume, host-suspension clock, 1h pass and 24h profile test. | Full 24-hour execution pending. |

## Experimental Components

| Module | Why Experimental |
| --- | --- |
| Shadowsocks outbound | Three AEAD methods pass local fixtures, but no external reference implementation was available. |
| Trojan outbound | Local plain fixture passes; public TLS/SNI ecosystem interoperability is unsigned. |
| DoH resolver | Mock-tested A-record POST/fallback path; no broad provider or malformed-response matrix. |
| WASM extensions | Loader and exported calls work, but data-path transforms and CPU budgets are not integrated. |
| Worker pool | CPU task lifecycle is tested; no production workload baseline or adaptive sizing. |
| TCP connection pool | Primitive is tested but intentionally not used for arbitrary proxy tunnels. |
| Subscription parser | Parses supported URLs/lists; provider-specific update/signature behavior is absent. |
| YAML/rule-set conversion | Parses local examples; broad third-party dialect compatibility is not claimed. |
| Active least-latency probing | Health data path exists; real probes for every outbound are not automatically configured. |

## Unsupported Components

- Native QUIC transport.
- Hysteria2 transport/protocol.
- WireGuard packet forwarding (configuration boundary only).
- TUN mode.
- Fake-IP DNS allocation.
- Shadowsocks and Trojan inbounds.
- Remote plugin inbound factories, UDP factories, socket-handle transfer, and stream transforms.
- OS-level plugin sandboxing.
- Authenticated metrics endpoint.
- Automatic verification of Shadowrocket, NekoBox, v2rayN, Surge, Stash, or Mihomo without those clients installed.

## Release Decision

The core is suitable for controlled beta testing and RC1 packaging. It is not production-ready as a whole. Production-stable status requires signed real-client acceptance, a completed 24-hour soak, external Shadowsocks/Trojan interoperability, and closure or explicit acceptance of the high-priority debts in `docs/technical-debt.md`.
