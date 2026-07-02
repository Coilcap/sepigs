# Transactional Reload Prototype

Status: M4 prototype retained. M5 now connects separate runtime adapters for
Metrics and Dashboard only; the prototype adapters and shadow mode remain
isolated and do not replace the legacy reload path.

## What M4 Proves

The prototype executor implements the M3 state machine across parse, validate,
prepare, health, commit, rollback, and cleanup. It verifies:

- every component prepares and passes health checks before commit begins;
- prepare failure compensates and cleans already prepared components;
- health failure rolls back prepared components in reverse order;
- partial commit failure rolls back only components that committed;
- rollback and cleanup are bounded, best-effort recovery operations;
- a rollback failure is recorded without replacing the original error;
- timeout and caller cancellation propagate an abort signal;
- cleanup runs after success, failure, cancellation, and rollback failure;
- ordered, bounded, redacted events and in-memory metrics describe the result.

The mock fixtures are deterministic and own no network resources. The adapter
skeletons alter only their own simulated generation value.

## Shadow Mode

Run:

```bash
npm run reload:shadow -- --config examples/sepigs.safe.json
```

The command loads and validates the current and candidate configurations,
builds the M3 difference plan, and executes changed components through
prototype-only adapters. It writes:

- `reports/reload/shadow-latest.json`
- `reports/reload/shadow-latest.md`

A successful shadow commit means the transaction coordinator completed. It
does not publish a production generation. Shadow mode does not invoke Engine,
open a listener, stop a component, close a connection, schedule a probe, load
a plugin, or migrate runtime state.

## Rollback Failure

The first prepare, health, or commit error is retained as the transaction
failure reason. Rollback failures are appended as component errors and events.
Remaining rollback callbacks and all cleanup callbacks still run. Each
recovery callback receives a fresh, short deadline because the original
transaction signal may already be aborted.

This demonstrates coordinator behavior only. A production adapter must still
implement its declared strategy:

- `keep-old-generation`
- `keep-new-generation-and-alert`
- `require-process-restart`

## Unverified Runtime Behavior

M4 does not verify:

- real listener bind, handoff, same-address replacement, or connection drain;
- real DNS cache or fake-IP mapping migration;
- real outbound ownership for established streams;
- real plugin or WASM hot swap and irreversible plugin side effects;
- real UDP session ownership or migration;
- atomic publication of an Engine runtime snapshot;
- concurrent reload serialization or file-event coalescing.

These remain open even when all M4 tests pass.

## M5 Result

M5 added an explicitly enabled control-plane wrapper for Metrics and
Dashboard. It rejects mixed data-plane changes, does not automatically fall
back after a failed transaction, and keeps `reload.mode = "legacy"` as the
default. See [transactional-reload-runtime-m5.md](transactional-reload-runtime-m5.md).

Inbound, UDP, fake-IP, plugin, outbound, DNS, and routing remain outside the
runtime transaction. M5 does not authorize wholesale Engine replacement.
