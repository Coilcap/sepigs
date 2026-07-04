# M11 Limited Outbound Runtime Reload

Status: implemented as an explicit experimental feature.

## Scope

M11 adds `outbound` to
`reload.transactional.enabledComponents`. The runtime adapter accepts only:

- `direct`;
- `block`;
- `tcpRelay`.

It rejects Shadowsocks, Trojan, WireGuard, plugin/unknown types, and every
experimental outbound. Inbound listeners, UDP sends/sessions, fake-IP,
plugins, and connection-manager are not part of the transaction.

`reload.mode` still defaults to `legacy`. M11 runs only when
`transactional-experimental` and the `outbound` component are explicitly
enabled.

## Prepare And Health

Prepare builds and validates an immutable candidate `OutboundGeneration`,
checks route/policy references, classifies every entry as low risk, and
constructs candidate outbound objects. Construction does not connect to any
target, mutate the active registry, or close a connection.

Health verifies candidate object/tag/type correspondence and the allowed
factory boundary. TCP relay host/port shape is validated before publication.

## Commit And Routing Atomicity

The runtime registry owns the active generation pointer and actual outbound
objects. Commit performs one synchronous pointer switch. New TCP setup then
acquires the candidate generation.

If Router or Policy also changes, those candidates remain staged until the
Outbound adapter commits. The Outbound commit completes the shared routing
transaction, so a new route cannot target an unpublished registry.

## Existing Connections And Drain

TCP setup acquires an outbound generation reference before calling
`connect()`. A successful stream keeps that reference until socket close.
Reload never migrates, reroutes, or force-closes it.

The old generation is marked draining after switch. It remains readable while
any reference exists and retires only after the count reaches zero. Retirement
stops and unregisters old outbound objects. UDP deliberately remains on the
legacy registry in M11.

## Rollback And Cleanup

Prepare or health failure leaves the active registry unchanged. A partial
commit restores the old active generation before surfacing failure. Executor
rollback reverses published registry and routing state. Cleanup is idempotent:
an unused candidate is stopped once, while a committed old generation is
retired only when safe.

There is no automatic fallback to legacy reload after an experimental
transaction failure.

## Observability

Experimental Prometheus output includes:

- `sepigs_reload_component_prepare_duration_ms{component="outbound-registry"}`;
- `sepigs_reload_component_commit_duration_ms{component="outbound-registry"}`;
- `sepigs_reload_component_rollback_total{component="outbound-registry"}`;
- `sepigs_reload_active_outbound_generation_id`;
- `sepigs_reload_outbound_generation_draining`;
- `sepigs_reload_outbound_rejected_unsupported_total`.

Generation snapshots expose tag, type, keyed config hash, risk, and reference
counts. They do not expose config snapshots, passwords, tokens, private keys,
target secrets, or unbounded identifiers as metric labels.

## Runtime Smoke

Run:

```bash
npm run reload:runtime-smoke:m11 -- \
  --config examples/sepigs.transactional-outbound.experimental.json
```

The local-only smoke proves:

- an established direct CONNECT tunnel continues against the old target;
- a new CONNECT tunnel uses the candidate TCP relay target;
- direct, block, and TCP relay are present in the active registry;
- old references remain readable and the old generation drains after close;
- Shadowsocks and Trojan candidates reject without secret disclosure;
- listener and DNS/fake-IP state do not change;
- final connections and tracked sockets/timers/listeners are `0/0/0/0`.

Evidence is written to:

- `reports/reload/runtime-smoke-m11-latest.json`;
- `reports/reload/runtime-smoke-m11-latest.md`.

## Known Limits

- UDP does not use the generation-aware registry.
- Shadowsocks/Trojan and experimental outbound reload remain unsupported.
- Candidate construction validates target shape but does not probe a relay.
- Concurrent reload serialization and extended repeated-reload soak remain
  promotion gates.
- ActiveProber lifecycle is not owned by the outbound generation.

M12 should begin with an HTTP/SOCKS TCP inbound prototype review. This M11
evidence does not authorize inbound runtime publication.
