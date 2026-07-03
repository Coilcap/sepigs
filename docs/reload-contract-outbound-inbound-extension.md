# Reload Contract Extension: Outbound And Inbound

Status: M9 design only. These contexts are not TypeScript runtime contracts.

## Common Rules

Future adapters extend `ReloadableComponent` without gaining direct access to
mutable Engine globals. Every dependency is a read-only snapshot, capability,
or transaction-owned publication handle.

All adapters must:

- honor the transaction deadline and `AbortSignal`;
- produce a complete resource inventory;
- make prepare side-effect free with respect to active state;
- make cleanup idempotent;
- publish only after every required component is prepared and healthy;
- retain old state until rollback is no longer possible;
- use bounded logs and redact configuration secrets;
- expose rollback failure and degraded state.

No adapter may call `Engine.reloadConfig()`, mutate the global config, clear a
live registry, close arbitrary connections, or register process-global plugin
factories during prepare.

## OutboundReloadContext

```text
activeConnectionSnapshot
policyGeneration
proberSnapshot
dnsGeneration
timeout
abortSignal
```

Recommended semantics:

- `activeConnectionSnapshot`: read-only counts/references by current outbound
  generation; it cannot close connections.
- `policyGeneration`: candidate-compatible Router/Policy binding and target
  validation capability.
- `proberSnapshot`: immutable health/backoff evidence; no timer or promise is
  shared.
- `dnsGeneration`: identity of the DNS generation used for validation. The
  outbound adapter cannot switch DNS.
- `timeout` and `abortSignal`: one effective transaction budget propagated to
  construction, readiness, rollback, and cleanup using bounded recovery
  contexts.

The prepared value contains candidate registry, old generation handle,
identity/carry-over plan, resource descriptors, and publication token.

## InboundReloadContext

```text
listenerRegistry
publicBindPolicy
authPolicy
readinessProbe
drainPolicy
timeout
abortSignal
```

Recommended semantics:

- `listenerRegistry`: immutable active listener snapshot plus transaction-owned
  candidate factory/publication capability.
- `publicBindPolicy`: validates normalized host/address exposure before bind.
- `authPolicy`: validates protocol authentication without exposing secrets.
- `readinessProbe`: loopback-only bounded protocol probe.
- `drainPolicy`: immutable deadlines, warning thresholds, and forced-close
  prohibition/authorization.
- `timeout` and `abortSignal`: apply to bind, readiness, rollback, and cleanup.

The adapter cannot call global `ConnectionManager.closeAll()`. It may observe
generation references and request drain of only resources it owns.

## Prepare

Prepare must:

- parse and validate the complete candidate;
- classify reuse/add/remove/replace/restart-required;
- construct all candidate objects before publication;
- bind only through a transaction-owned candidate listener capability;
- avoid accepting production traffic before commit;
- register every opened listener, socket, timer, pool, or file-backed object;
- leave active generations and existing connections unchanged.

Any failure tears down all candidate resources. A partial candidate is never
published.

## Health Check

Outbound health checks are local/mock by default for direct/block/TCP relay.
Public probes require explicit policy and remain outside the first prototype.
Shadowsocks/Trojan admission requires reference interoperability evidence.

Inbound health checks use loopback protocol probes and verify both accepted and
rejected authentication paths where applicable. A bare `listening` event is
only bind readiness, not protocol readiness.

## Commit

Commit consumes a one-use publication token and switches a composite active
snapshot. It must not incrementally mutate a `Map`.

Outbound publication binds Router/Policy selections to the candidate registry.
Inbound publication opens candidate accept gates and closes old accept gates
in one ordered boundary.

No candidate resource is destroyed until its ownership has transferred or
rollback is impossible.

## Rollback

Rollback before commit discards only candidate state. Rollback after commit
restores the old publication pointer when possible and drains the candidate.
It never migrates a live stream.

Rollback uses a fresh bounded recovery context. Failure is recorded with:

- transaction and component;
- failing recovery stage;
- active/old/candidate generation IDs;
- remaining resource counts;
- selected `ReloadRollbackFailureStrategy`;
- degraded-state reason code.

The runtime must not report config success, clear diagnostics, or accept
another conflicting reload while degraded.

## Cleanup

Cleanup is safe to repeat and releases only candidate or retired
generation-owned resources. It verifies final listener/socket/timer/pool/ref
counts and records anything still draining.

Cleanup does not treat a healthy long-lived user stream as a leak. It does
alert when a generation has no references but still owns resources.

## Contract Extensions Needed Before Code

The common contract will eventually need:

- typed generation handles and publication tokens;
- component degraded-state reporting;
- explicit drain phase after commit;
- resource owner/ref-count snapshots;
- prepare-time candidate accept gates;
- rollback result instead of `Promise<void>`;
- cross-component composite publication.

M9 does not modify `src/reload/contract.ts`. These changes require separate M10
authorization and tests.
