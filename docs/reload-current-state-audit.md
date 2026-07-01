# Reload Current-State Audit

Scope: `main` at M3 design review. This document describes current behavior; it
does not claim transactional reload.

## Entry Points

- `HotReloadManager` watches the config and rule-set files, debounces events,
  loads and validates the complete config, then calls `Engine.reloadConfig`.
- Dashboard `POST /api/reload` calls the configured loader and the same engine
  method.
- Tests and soak tools call `Engine.reloadConfig` directly.
- There is no reload mutex, transaction ID, generation snapshot, or
  cross-component rollback coordinator. Concurrent reload calls can overlap.

## Component Matrix

| Component | Current mechanism | Replacement style | Rollback today | Existing connection effect | Main risk |
| --- | --- | --- | --- | --- | --- |
| Config loader | Parse, migrate, schema validate, expand local rule-set files before callback | Candidate value only | Invalid input never reaches Engine | None | Watch events can overlap and apply out of order |
| Inbounds | `reloadInbounds` starts changed/new listeners, then drains old listeners | Staged by tag; unchanged instances reused | Candidate start failure stops staged listeners and keeps old map | Established TCP sockets survive `drain`; old listener stops accepting | Same-address changes cannot bind before drain; a later component failure occurs after old listeners already drained |
| Router | Construct new `Router` and assign field | Atomic object assignment | None after assignment | Established streams unchanged; new routing calls see new object | Can switch while outbounds still represent another config |
| DNS | Construct and assign new resolver | Immediate object replacement | None | Established streams unchanged; later DNS calls use new resolver | Ordinary cache and in-flight state are dropped |
| Fake-IP | Reuse `FakeIpService` only when range/size/TTL/persist path match | Conditional store reuse | No migration rollback | Existing sessions may retain an address while reverse lookup moves to new store | Mapping loss can route a fake IP as a real destination |
| Policy/health | `RoutingPolicyManager.reload` replaces policies in place | Local mutable update | None | New selections see new policies | Health entries for removed tags remain; round-robin indexes and probe state can become stale |
| Prober | `ActiveProber` exists as a standalone facility and is not owned/reloaded by Engine | No Engine reload integration | Not applicable | None in current Engine path | Config can change without a corresponding running prober generation |
| Connection pool | Close all idle sockets and construct a new pool | Destructive replacement | None | Leased/active sockets are outside idle pool; idle sockets close | Later reload failure cannot restore the old pool |
| Outbounds | Stop every current outbound, clear registry, construct all configured outbounds | Destructive full rebuild | None | Built-in outbound `stop` is mostly no-op; established sockets usually survive | Factory failure can leave an empty or partially rebuilt registry |
| Dashboard | Stop old server, construct new server, start it | Stop-then-start | None | Dashboard requests/connections can be interrupted | Bind failure leaves old control endpoint stopped; token change is not atomic |
| Metrics | Stop old server, construct new server, start it | Stop-then-start | None | Scrapes can fail during the gap | Bind failure leaves metrics unavailable |
| Plugins | `loadAll` unloads changed/removed runners, then loads missing runners | Incremental destructive update | Setup failure cleans only the new runner | Plugin-backed new requests/factories can disappear; established external sockets vary by plugin | Failure after unload does not restore old plugin or registrations |
| WASM | Load missing enabled tags only | Additive | Compile failure leaves previously loaded entries, but no complete rollback | Existing users keep prior objects | Changed/disabled entries are not removed or replaced |
| Connection manager | Long-lived singleton | Not reloaded | Not applicable | Owns all active TCP connections | New max-connection/timeout config is not applied consistently |
| UDP session manager | Long-lived singleton with fixed limits/timers | Not reloaded | Not applicable | Existing UDP sessions continue | New UDP limits/idle timeout are not applied; sessions are not generation-owned |

## Current Mutation Order

`Engine.applyReloadConfig` currently:

1. Stages and starts changed inbounds, then drains old changed inbounds.
2. Assigns config, router, DNS, policy, connection pool, and transport fields.
3. Stops/restarts metrics if changed.
4. Stops/restarts Dashboard if changed.
5. Loads WASM and plugin changes.
6. Stops and rebuilds all outbounds.
7. Replaces the inbound map and lifecycle registrations.

If steps 2-6 fail, there is no reverse operation. Most critically, successful
candidate inbounds may be running but not registered while old inbounds are
already drained. That is a partial-commit and resource-ownership risk.

## Race Conditions

- `HotReloadManager.reload` and `Engine.reloadConfig` are not serialized.
- A slow older reload can complete after a newer file event and overwrite it.
- New connections can observe a new router with an old/empty outbound map.
- Dashboard and metrics can be stopped by one reload while another starts a
  different candidate.
- Plugin owner registrations can change while outbound construction reads the
  global registry.
- Fake-IP reverse lookup and route selection read mutable Engine fields at
  different points without one generation snapshot.

## Resource Risks

- Candidate inbounds are not owned by lifecycle management until late commit.
- Metrics/Dashboard start failures have no old-server restart path.
- Plugin unload/setup failures can leave registrations changed.
- DNS in-flight promises are abandoned with the old resolver reference.
- Connection pool idle timers/sockets are closed destructively.
- Draining listeners have no generation ID, deadline, or completion inventory.
- UDP sessions and active TCP connections cannot be attributed to the config
  generation that accepted them.

## DNS, Fake-IP, And UDP

- Compatible fake-IP configuration reuses mappings; incompatible changes drop
  the in-memory mapping without migration.
- DNS cache and negative cache are always replaced.
- Existing SOCKS5 UDP associations use the singleton session manager but route
  each datagram through current Engine fields, so one association can span
  router/DNS generations.
- Existing regression tests prove selected route reloads work, not atomic
  failure recovery across DNS/fake-IP/UDP changes.

## Dashboard Security Boundary

- Dashboard remains loopback-only by schema default and requires bearer auth
  when enabled.
- A reload request failure is contained at the HTTP route and does not crash
  the server.
- Dashboard configuration replacement itself is stop-then-start. A failed bind
  or token/listen change has no atomic rollback and can remove administrative
  visibility during the incident.
- Logs redact configured secrets. M3 dry-run uses a run-local keyed HMAC for
  config identity; events must never emit candidate tokens, proxy passwords,
  plugin options, or an unkeyed hash of secret-bearing config.
