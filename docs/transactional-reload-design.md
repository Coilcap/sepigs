# Transactional Reload Design

Target: v0.3.0 design only. Phase 10 does not implement the full transaction.

## Stages

1. Parse the candidate file without mutating runtime state.
2. Validate schema, references, public-bind policy, plugin manifests, and immutable constraints.
3. Build a reload plan that identifies unchanged, replaceable, drainable, and restart-required components.
4. Stage DNS/cache policy, router, outbound, Dashboard/metrics, plugin, and changed inbound instances in isolation.
5. Bind replacement listeners before draining old listeners whenever addresses differ.
6. Run component readiness checks and reject the candidate if any staged component fails.
7. Atomically publish one immutable runtime snapshot used by new requests.
8. Drain superseded inbounds and release old outbound/plugin/DNS resources after the commit.

## Rollback

- Before commit, stop every staged component and retain the old snapshot untouched.
- After commit, a cleanup failure raises an alert but does not switch requests back to partially stopped components.
- Same-address listener replacement uses stop/start with a bounded rollback restart because two plain Node servers cannot own the address concurrently.
- Plugin factories are owner-scoped; crash, timeout, removal, or API mismatch unregisters only that owner's staged registrations.
- Every transaction has an id, deadline, ordered event log, and final state: committed, rolled-back, or cleanup-degraded.

## Failure Recovery

- Parse/schema failures never reach runtime components.
- DNS/router/outbound/plugin readiness failures roll back all staged resources.
- Inbound bind failure leaves existing listeners accepting traffic.
- Dashboard/metrics failure keeps the old control plane bound.
- Process interruption before commit discards the candidate; interruption after commit resumes idempotent cleanup at startup.

## Current Boundary

Inbound drain-and-rebind already stages changed listeners, and route-only reload no longer restarts unchanged Dashboard/metrics listeners. The remaining Engine reload path mutates several components sequentially, so cross-component rollback is documented technical debt rather than production-ready transactional behavior.
