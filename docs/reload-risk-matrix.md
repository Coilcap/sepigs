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
corresponding component can join the M4 prototype. A documented mitigation
without a test remains open.
