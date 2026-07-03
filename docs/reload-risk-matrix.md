# Reload Risk Matrix

| Risk | Component | Severity | Likelihood | Detection | Mitigation | Rollback strategy | Test needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Inbound port conflict | Inbound | High | High | Candidate bind error and address inventory | Pre-bind different address; explicit same-address strategy | Keep old listener; stop candidate | Inject `EADDRINUSE`, verify old accepts |
| DNS cache replacement | DNS | Medium | High | Cache generation and hit-rate telemetry | Isolated candidate cache; bounded migration | Retain old resolver before commit | In-flight and cache continuity cases |
| Fake-IP mapping loss | Fake-IP | Critical | Medium | Mapping generation/miss counters | Compatibility check and atomic mapping copy | Keep old store; reject incompatible live change | Reverse-map continuity under failed reload |
| UDP session under reload | UDP | High | High | Session generation and final resource counters | Pin session to generation; drain by owner | Keep old manager until sessions end | Continuous UDP across success/failure |
| Plugin reload failure | Plugins | Critical | Medium | Runner/factory owner events | Isolated namespace, permission check, bounded setup | Reverse-order unload; restart if irreversible | Crash/timeout at each lifecycle step |
| Dashboard token change | Dashboard | Critical | Medium | Auth contract probe without logging token | Candidate auth health check; atomic endpoint publication | Keep old endpoint/token until commit | Old/new token acceptance boundary |
| Metrics port change | Metrics | Medium | Medium | Scrape probe and listener inventory | Candidate bind before old stop | Keep old server | Port conflict and scrape continuity |
| Outbound removal with active connections | Outbounds | High | Medium | Connection-to-generation ownership | Drain old registry; new requests use candidate | Retain old outbound objects | Long-lived streams during removal |
| Prober state reset | Policy/prober | Medium | High | Health snapshot comparison | Migrate health/backoff by unchanged tag | Retain old policy snapshot | Least-latency/failover continuity |
| Rollback failure | All staged resources | Critical | Medium | Rollback result/event and leak detector | Idempotent cleanup, reverse order, separate deadline | Component policy; process restart when required | Fault every rollback callback |
| Partial commit failure | Runtime snapshot | Critical | Medium | Mixed-generation assertion via Dashboard/metrics | Single immutable snapshot assignment | No component activation before switch | Inject failure around commit boundary |
| Config parse failure | Config | Low | Medium | Typed loader error | Parse before transaction creation | No runtime action | Malformed JSON/YAML/rule-set |
| Future schema version | Config | High | Low | Migration/schema validation | Reject before preparation | No runtime action | Future `configVersion` rejection |

## Exit Rule

Any Critical risk needs an automated fault-injection test before the
corresponding component can join a production transaction. A documented
mitigation or prototype-only test without real resource ownership remains
open.

## M4 Evidence

- Executor fixtures cover prepare, health, partial commit, rollback failure,
  timeout, caller abort, reverse compensation, event ordering, and cleanup.
- Rollback and cleanup use bounded recovery contexts independent of an
  expired transaction signal.
- Shadow mode processes real validated config differences while reporting
  zero listeners opened, zero connections closed, and no Engine invocation.
- Adapter skeletons own no production objects and explicitly state their
  capability boundaries.
- Event text is bounded and redacts credential-like values; metrics remain
  transaction-local and are not exposed through Prometheus.

The listener, DNS/fake-IP, plugin, outbound ownership, UDP migration, partial
runtime commit, and concurrent reload risks remain open for M5 and later.

## M5 Evidence

- Metrics and Dashboard use real loopback listeners under an explicit,
  default-off feature flag.
- Port conflicts fail during prepare and leave old endpoints reachable.
- Disabled/enabled transitions, same-address path/token updates, endpoint
  replacement, cleanup, redaction, and no-fallback behavior have real tests.
- The wrapper rejects any non-control-plane difference before adapter prepare.
- Runtime smoke verifies both endpoints and final tracked resources at
  `0/0/0`.
- Reload metric samples are bounded and expose no error text or identifiers as
  labels.

Open M5 risks include the prepare-to-commit port race, whole-runtime atomicity,
reload serialization, and every non-control-plane component.

## M7 Evidence

- Router rules/defaults and policy graphs are immutable generation objects.
- Router and policy adapters stage independently but publish one active pair
  only after every changed routing component commits.
- Missing targets and invalid policy values fail before publication; rollback
  keeps or restores the old pair.
- Health and latency state carry over by value. No active probe is started,
  stopped, or mutated.
- A real loopback CONNECT stream survives Router/Policy publication and
  continues echoing; the first new connection follows the candidate block
  route.
- Runtime smoke records zero reload-driven connection closes, zero listener
  changes, no DNS/fake-IP changes, and final tracked resources at `0/0/0`.
- Active generation metrics are numeric gauges without route values, target
  domains, secrets, or generation strings as labels.

Open M7 risks include concurrent reload serialization, extended mixed reload
soak, rule-set file reloading through already-expanded config, active prober
lifecycle ownership, and every M8+ component.
