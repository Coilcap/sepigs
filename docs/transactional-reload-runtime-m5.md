# Transactional Reload Runtime M5

Status: experimental small-scope runtime integration.

M5 connects the transaction executor to the Metrics and Dashboard control
plane only. The default remains `legacy`, and the existing reload path remains
available unchanged.

## M7 Boundary Update

M5 itself remains the Metrics/Dashboard control-plane integration. M7 extends
the explicit experimental allow-list with:

- `metrics`
- `dashboard`
- `router`
- `policy`

Router and policy publication changes only decisions for new connection
setup. Established streams retain their already selected outbound. DNS,
fake-IP, outbound registry, inbound listeners, UDP sessions, connection
manager, plugins, remote plugin RPC, and WASM remain rejected or legacy-only.
See `transactional-reload-runtime-m7.md` for the M7 ownership boundary.

## Enable

Use the experimental example:

```bash
npm run reload:runtime-smoke -- --config examples/sepigs.transactional-reload.experimental.json
```

The required config shape is:

```json
{
  "reload": {
    "mode": "transactional-experimental",
    "transactional": {
      "enabledComponents": ["metrics", "dashboard"],
      "timeoutMs": 5000,
      "shadowBeforeCommit": true,
      "rollbackOnFailure": true
    }
  }
}
```

The checked-in example keeps Dashboard disabled and contains no usable
credential. The smoke runner enables Dashboard only in memory with an
ephemeral test token, then destroys the server during teardown.

Transactional mode accepts only explicitly enabled M5/M7 components. A mixed
DNS, outbound, inbound, plugin, worker, connection, fake-IP, UDP, or other
unsupported change is rejected before preparation. There is no automatic
legacy fallback after transaction failure because running both paths could
repeat side effects.

## Commit And Rollback

- A different listener address is probed during prepare.
- Commit starts the candidate endpoint before stopping the old endpoint.
- Same-address Metrics path changes update the existing server in place.
- Same-address Dashboard token, CORS, and rate-limit changes update the
  existing server in place.
- Disabled-to-enabled starts a candidate; enabled-to-disabled stops the old
  endpoint and retains it for rollback.
- Port conflict, health failure, or later component failure keeps or restores
  the old endpoint.
- Candidate cleanup is idempotent and runs on success and failure.

The port availability probe is a preflight, not an operating-system
reservation. A process can claim the port between prepare and commit; the
candidate start then fails and the adapter restores the old state.

## Runtime Metrics

Transactional mode adds:

- `sepigs_reload_total`
- `sepigs_reload_success_total`
- `sepigs_reload_failure_total`
- `sepigs_reload_rollback_total`
- `sepigs_reload_duration_ms`
- `sepigs_reload_component_prepare_duration_ms`
- `sepigs_reload_component_commit_duration_ms`
- `sepigs_reload_component_rollback_total`
- `sepigs_reload_active_router_generation_id`
- `sepigs_reload_active_policy_generation_id`

Transaction IDs, generation IDs, config values, tokens, and failure text are
not metric labels. Duration sample storage is bounded to 256 entries. Legacy
mode does not expose these metrics.

## Smoke Success

`reports/reload/runtime-smoke-latest.json` and `.md` must show:

- transaction state `committed`;
- Metrics and Dashboard endpoint checks `passed` when enabled;
- no legacy fallback and no data-plane mutation;
- transaction cleanup completed with zero cleanup errors;
- active connections and tracked sockets/timers/listeners at zero after stop.

## Known Limits

- This is experimental, not a complete whole-Engine generation switch.
- Concurrent reload serialization remains outside M5.
- Inbound, outbound registry, DNS, fake-IP, plugins, policy/prober, connection
  manager, and UDP session manager are not transactional.
- A Metrics or Dashboard request already in progress follows normal Node
  server close semantics.
- Duration metrics are latest-value gauges in M5; production histograms remain
  future work.
