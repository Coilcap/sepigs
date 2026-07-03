# Transactional Reload Runtime M7

Status: experimental, default-off Router/Policy integration.

## Scope

M7 adds `router` and `policy` to the explicit
`transactional-experimental` allow-list. Metrics and Dashboard retain their M5
behavior. The default reload mode remains `legacy`.

M7 does not transactionally reload DNS, fake-IP, inbound listeners, outbound
registry entries, UDP sessions, connection-manager state, plugins, RPC, WASM,
TUN, QUIC, Hysteria2, or WireGuard.

The current allow-list remains exactly:

- `metrics`
- `dashboard`
- `router`
- `policy`

M8 DNS design documents a possible future generation/adapter but does not add
`dns`. DNS implementation and allow-list admission require separate M8.5
authorization. Fake-IP pool/store runtime reload is now deferred to the M14
UDP/fake-IP strategy.

## Generation Model

`RouterGeneration` contains immutable metadata, rules, default target, config
hash, and compiled matcher state. `PolicyGeneration` contains an immutable
policy graph plus copied health and latency snapshots. The runtime publishes
one pair containing both generations and its policy manager.

Each connection setup acquires the active pair once. Router matching and
policy selection use that captured pair. After the outbound connection is
established, the stream keeps its selected outbound and is never re-routed.
The old pair remains readable while a setup handle references it and is then
eligible for retirement.

## Transaction

Prepare validates targets and builds candidates without opening ports,
connecting outbounds, closing connections, or mutating the active pair.
Health checks run deterministic route matches and local policy selections.
They do not execute network probes.

When both Router and Policy change, the first adapter commit records readiness
but does not publish. The second commit atomically publishes the combined
pair. A failure before publication discards candidates. A partial-commit
failure restores the old pair. Cleanup is idempotent.

Health carry-over is read-only by value. Failures, successes,
`lastFailureAt`, and latency EWMA are copied for unchanged outbound tags.
Round-robin cursors and active probe ownership are not migrated.

## Configuration

Use the checked-in loopback-only example:

```bash
npm run reload:runtime-smoke:m7 -- \
  --config examples/sepigs.transactional-router-policy.experimental.json
```

The component list must explicitly contain `router` and/or `policy` for the
corresponding changed config. Unsupported mixed changes fail before prepare
and do not fall back to the legacy path.

## Observability

Experimental metrics include generic transaction counters and component
durations for `router` and `policy-prober`, plus:

- `sepigs_reload_active_router_generation_id`
- `sepigs_reload_active_policy_generation_id`

Generation IDs are numeric sequence gauges. Route values and destinations are
not labels. Legacy mode omits all reload-generation metrics.

## Runtime Evidence

The smoke starts a local echo service and sepigs HTTP inbound. It establishes
a direct CONNECT tunnel, publishes a candidate whose default route is block,
then checks:

- the original tunnel echoes before and after reload;
- a new CONNECT receives HTTP 403;
- Router and Policy generation IDs advance;
- zero connections are closed by reload;
- the inbound address is unchanged;
- DNS and fake-IP are unchanged;
- final active connections and tracked sockets/timers/listeners are zero.

Reports:

- `reports/reload/runtime-smoke-m7-latest.json`
- `reports/reload/runtime-smoke-m7-latest.md`

## Known Limits

- Reload requests are not yet serialized.
- Active prober lifecycle is outside M7; only a copied snapshot is carried.
- Outbound identity is assumed unchanged because outbound config changes are
  rejected.
- Rule-set files must already be expanded by config loading.
- The runtime smoke is not a long-duration mixed reload soak.
- M7 is not production-stable and is not a whole-runtime transaction.
- M8 design documents do not change this runtime boundary.

## Post-M8.5 Boundary

M7's allow-list above is preserved as its milestone record. M8.5 subsequently
adds `dns` only when explicitly enabled. The current runtime allow-list is
therefore `metrics`, `dashboard`, `router`, `policy`, and `dns`. Fake-IP,
inbound, outbound, UDP sessions, connection-manager, and plugins remain
rejected. Default `legacy` behavior is unchanged.

M9 adds design evidence for outbound and inbound ownership but does not change
this list. M10 requires separate authorization and begins with an outbound
generation prototype only, not runtime publication.
