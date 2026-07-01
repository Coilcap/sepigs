# Transactional Reload Design v0.3.0

Status: design review. M3 adds types, a state model, contracts, and dry-run
planning only. It is not connected to `Engine.reloadConfig`.

## Invariants

- One reload transaction executes at a time; later requests coalesce to the
  newest validated candidate or receive a deterministic busy result.
- The active runtime is one immutable generation reference used by each new
  request from routing through outbound selection.
- The active generation changes once, only after every required component is
  prepared and healthy.
- Pre-commit failure leaves the old generation untouched and releases all
  candidate resources.
- Existing TCP connections retain the generation resources they already own.
- UDP sessions receive explicit generation ownership before transactional
  runtime rollout.
- Secrets never appear in transaction events, metric labels, or plan output.

## Lifecycle

1. **Parse new config**: read candidate files and rule sets without runtime
   mutation.
2. **Schema validate**: validate version, references, safe binds, plugin
   declarations, and immutable constraints.
3. **Build candidate generation**: assign generation/config hashes, diff
   components, and identify restart-required changes.
4. **Prepare candidate resources**: construct isolated DNS/router/policy,
   outbounds, plugin registrations, and bindable listeners.
5. **Health check candidate**: bounded component checks prove listeners,
   dependencies, and registries are usable.
6. **Atomic switch**: publish one candidate runtime snapshot for new work.
7. **Drain old generation**: stop old accepts, retain established resources,
   and close them at completion or drain timeout.
8. **Rollback on failure**: before commit, call rollback in reverse preparation
   order and keep the old snapshot active.
9. **Cleanup temporary resources**: idempotently release candidate or retired
   resources and record degraded cleanup.
10. **Emit reload event**: record transaction/generation IDs, result,
    component durations, failure class, and cleanup status.

## Transaction Scope

| Component | Same transaction | Prepare model | Commit model | Rollback |
| --- | --- | --- | --- | --- |
| DNS | Yes | Isolated resolver/cache | Snapshot pointer | Full before commit |
| Fake-IP store | Yes when compatible/migratable | Reuse or staged mapping copy | Generation-owned store reference | Full for copy; best-effort for external persistence |
| Router | Yes | Compile immutable rules | Snapshot pointer | Full |
| Policy/prober | Yes | Candidate policies and migrated health by tag | Snapshot pointer/start timer | Full before timer activation |
| Outbound registry | Yes | Build complete candidate map | Snapshot pointer | Full before commit; old map drains |
| Inbound listeners | Yes when bind strategy is supported | Bind new/different addresses | Activate candidate ownership, then drain old | Full before old drain |
| Dashboard | Yes when new address can bind | Start authenticated candidate | Publish endpoint, stop old | Best-effort on same address |
| Metrics | Yes when new address can bind | Start candidate endpoint | Publish endpoint, stop old | Best-effort on same address |
| Plugin manager | Conditional | Isolated runner/factory namespace | Publish owner namespace | Best-effort; restart if plugin has irreversible effects |
| Connection manager | Reused, not replaced | No M3 mutation | Shared infrastructure | Config changes require restart until generation-aware |
| UDP session manager | Reused in M3 | No M3 mutation | Existing sessions retain owner | Limit/timer changes require restart until generation-aware |

## Independent Reloads

- Rule-set file refresh may use the same transaction with only router changed.
- Read-only observability formatting can reload independently only when it does
  not replace the metrics listener.
- Log level may be independent after it has a dedicated atomic setter.
- Independent operations must still carry a generation/transaction ID and may
  not mutate components participating in another transaction.

## Restart-Required Changes

- Connection-manager resource limits until limiter ownership is replaceable.
- UDP session limits/idle timeout until sessions are generation-owned.
- Worker-pool topology and plugin isolation mode.
- Native/privileged transport changes.
- Plugin changes whose manifest declares irreversible external side effects.

Dry-run must reject or mark these changes; it must never silently claim they
were applied.

## Listener Strategy

- Different address/port: bind candidate first, health check, publish, drain
  old listener.
- Same address with only non-listener semantics changed: plain Node servers
  cannot both own the address. M4 must choose a shared acceptor, socket handoff,
  or bounded stop/start with tested old-listener restart.
- If candidate bind fails, old listener remains accepting.
- Drain stops accepts but preserves managed connections until completion or a
  configured deadline. Forced close is observable and never described as
  graceful.

## Failure Isolation And Rollback

- Parse/validation failure transitions directly to `failed`; no component ran.
- Prepare/health failure transitions to `rolling-back`; rollback executes in
  reverse order under a separate deadline.
- Commit is one in-process snapshot assignment. Component-side activation
  before that point is forbidden.
- Failure after atomic switch does not republish a partially drained old
  generation. It keeps the new generation active, alerts, and retries
  idempotent cleanup.
- Rollback failure follows the component contract:
  `keep-old-generation`, `keep-new-generation-and-alert`, or
  `require-process-restart`.
- Every bounded operation receives a child abort signal. Deadline expiry or
  transaction abort rejects the coordinator wait and signals the component;
  components remain responsible for idempotent release in rollback/cleanup.

## Generation Ownership

`ReloadGeneration` records ID, creation time, config hash, state, component
descriptors, resource descriptors, and parent generation. The runtime
prototype should maintain active, candidate, and draining generations.

Config hashes exposed outside the process use a process-local keyed HMAC over
the normalized config. The key is never logged or persisted. This preserves
same-transaction equality checks without exposing a dictionary-testable hash
of low-entropy credentials.

New connections capture the active generation once. Established sockets,
outbound objects, DNS decisions, and plugin handles remain reachable until
their generation reference count reaches zero. A drain deadline is a policy,
not permission to silently terminate connections.

## M3 Boundary

`src/reload/` is currently isolated from Engine. The state model does not
change hot reload behavior, metrics, listeners, connections, plugins, DNS,
fake-IP, UDP, or routing. M4 requires a separate prototype review before any
runtime integration.
