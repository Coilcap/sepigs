# Reload Observability Plan

Status: M5 emits a bounded subset with the listed metric names only in
`transactional-experimental` mode. The table describes the target contract;
generation/draining series, result labels, and histograms remain design only.

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `sepigs_reload_total` | counter | `trigger` | Accepted reload attempts |
| `sepigs_reload_success_total` | counter | `trigger` | Transactions reaching committed with acceptable cleanup |
| `sepigs_reload_failure_total` | counter | `stage`, `reason_class` | Transactions ending failed |
| `sepigs_reload_rollback_total` | counter | `result` | Rollback attempts by success/failure |
| `sepigs_reload_duration_ms` | histogram | `result` | End-to-end transaction duration |
| `sepigs_reload_generation` | counter | none | Monotonic generations created |
| `sepigs_reload_active_generation` | gauge | none | Numeric active generation sequence |
| `sepigs_reload_draining_generation` | gauge | none | Number of generations draining |
| `sepigs_reload_component_prepare_duration_ms` | histogram | `component`, `result` | Bounded prepare/health duration |
| `sepigs_reload_component_commit_duration_ms` | histogram | `component`, `result` | Component publication duration |
| `sepigs_reload_component_rollback_total` | counter | `component`, `result` | Component rollback outcomes |

## Events

Each structured event includes transaction ID, old/candidate generation IDs,
stage, component when applicable, monotonic duration, trigger, result, and a
bounded error class. It excludes config bodies, target domains, passwords,
tokens, plugin options, certificate paths, and stack traces by default.

Events:

- `reload.requested`
- `reload.validated`
- `reload.prepare.started/completed`
- `reload.health.failed`
- `reload.commit.started/completed`
- `reload.rollback.started/completed`
- `reload.drain.started/completed/forced`
- `reload.cleanup.degraded`
- `reload.finished`

## Cardinality And Semantics

- Transaction and generation IDs belong in logs/traces, not metric labels.
- `component`, `stage`, `result`, `trigger`, and bounded `reason_class` use
  fixed enumerations.
- Metrics increment once per state transition, not per file-system event.
- A parse failure counts as total+failure but creates no active generation.
- Post-commit cleanup degradation is success plus a cleanup-degraded event; it
  is not rewritten as rollback.
- Dashboard should expose active/draining generation IDs only after the
  runtime model exists and authentication/redaction checks pass.

## M5 Runtime Hook

M5 exports unlabeled total/success/failure/rollback counters, the most recent
transaction duration, latest per-component prepare/commit durations, and
component-only rollback counters. Trigger/result labels are not emitted yet.
Duration values are gauges in M5 rather than full histograms. The in-memory
sample lists are capped at 256 entries.

Failure reason, transaction ID, generation ID, token, config path, and target
metadata are never labels. Legacy mode emits none of the reload metric series.

## Alerts

Future alert rules should cover reload failure rate, rollback failure, long
prepare/commit duration, more than one draining generation beyond budget, and
an active generation that does not advance after repeated valid requests.
