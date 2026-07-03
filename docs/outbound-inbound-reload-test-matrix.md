# Outbound And Inbound Reload Test Matrix

Status: future M10-M14 acceptance matrix. M9 executes none of these runtime
changes.

## Outbound

| Area | Required case | Assertion |
| --- | --- | --- |
| Generation unit | Immutable registry metadata and isolated mutable refs | Candidate cannot mutate old map/config/health |
| Tag validation | Duplicate, empty, rename, type/identity change | Invalid graph rejected before publication |
| Policy references | Missing default, rule, policy member | Candidate prepare fails; old composite remains active |
| Removal | Remove outbound with pending setup | Old setup completes/fails on old object; new setup cannot select it |
| Active stream | Remove/change outbound during long TCP stream | Old stream continues; no forced close |
| New connection | Change TCP relay/direct/block selection | First post-commit connection uses candidate generation |
| Invalid outbound | Factory, config, readiness failure | Candidate resources zero; old registry unchanged |
| Rollback | Failure before/after registry publication | One coherent generation remains active |
| Health carry-over | Same and changed identities | Exact identity carries by value; changed identity starts cold |
| Prober | Late old result and backoff reset | Old callback cannot update candidate; no retry storm |
| Compatibility | External protocol matrix after reload | Baseline remains at least 44 verified and zero failed |
| Soak | Repeated valid/invalid reload under connections | No mixed generation, outage beyond budget, or unbounded refs/memory |

Protocol-specific deferred cases:

- Shadowsocks three ciphers, wrong password, large payload, remote close, and
  pending UDP exclusion;
- Trojan TLS/SNI/trust/password, large payload, remote close, and plaintext
  boundary;
- plugin owner crash/unregister and WireGuard/QUIC exclusion.

## Inbound

| Area | Required case | Assertion |
| --- | --- | --- |
| Candidate prepare | Different-port HTTP/SOCKS listener | Candidate binds behind accept gate; old remains accepting |
| Port conflict | One of several candidate ports is occupied | Every staged listener closes; old listeners remain usable |
| Readiness | Protocol and auth positive/negative probe | Commit occurs only after bounded probe success |
| Auth change | Old tunnel plus new valid/invalid credentials | Old tunnel survives; new handshakes use candidate auth |
| Public bind | Loopback to IPv4/IPv6 wildcard | Unsafe candidate rejected before bind |
| Drain | Stop old accepts after commit | Old clients survive; new clients enter candidate |
| Active HTTP/SOCKS | Long CONNECT across reload | Bytes continue in both directions without re-auth |
| Mobile reconnect | Burst disconnect/reconnect | Success/error budget and limiter remain bounded |
| Rollback | Candidate health/commit failure | Old listener accepts; candidate listener closes |
| Same address | Auth/protocol/TLS-only change | Uses approved strategy or reports unsupported/restart-required |
| Resource cleanup | Success, prepare failure, rollback failure | Sockets/timers/listeners return to expected zero/draining counts |
| Degraded state | Inject old-listener restoration failure | Alert/gauge/event visible; reload cannot report success |

Deferred UDP cases:

- active SOCKS5 UDP ASSOCIATE across TCP listener drain;
- control socket close, UDP socket close, session timeout, and reply routing;
- fake-IP reverse lookup continuity;
- final UDP sessions/sockets/timers zero.

## Cross-Component Transactions

Future combined tests must capture one compatible
Router/Policy/Outbound/Inbound revision and reject mixed publication:

- Router references a candidate-only outbound;
- outbound removed while old Router generation is in use;
- inbound candidate accepts while outbound candidate fails;
- DNS generation changes with direct outbound candidate;
- rollback occurs at each commit index;
- concurrent reload requests are serialized/rejected;
- cleanup failure enters degraded state.

No cross-component test may rely only on config hashes. It must observe actual
connection behavior and generation IDs.

## Required Gates Per Milestone

Every implementation milestone runs:

```text
lint
typecheck
full tests
build
docs check
security check
compat gate
dry-run
shadow
runtime smoke for all previously admitted components
milestone-specific soak
release dry-run when release files change
```

The soak report records success/error rates, p50/p95/p99, RSS/heap trends,
event-loop delay, active/draining generation counts, final resources, and
failure samples. Mock protocol evidence is never presented as external
compatibility evidence.
