# DNS Single-Flight Reload Design

Status: M8.5 generation boundary implemented.

## Ownership

Each query captures the active DNS generation before cache lookup. The
single-flight key is generation-local:

```text
generationId + normalizedName + recordType + resolverPolicyKey
```

The first implementation supports A records, but record type remains in the
key so future AAAA support cannot accidentally join A work.

Each generation owns its own Map. Maps are never shared, copied, or merged.
Identical queries started on opposite sides of commit may run concurrently,
which is preferable to cross-generation contamination.

## Commit And Rollback

- Commit does not cancel old work.
- Existing callers continue awaiting the old promise.
- New callers join or create work only in the active candidate generation.
- Old completion writes only to the old generation cache and counters.
- Rollback keeps old work unchanged and prevents candidate results from
  entering the restored old cache.
- Candidate work started by an explicit health check writes to a dedicated
  probe result, not the candidate production cache, unless policy explicitly
  permits it after successful commit.

An old generation retires only after its active count and single-flight Map
both reach zero and resolver resources are closed.

## Timeout And Cancellation

Every query receives a generation policy deadline plus optional caller
`AbortSignal`. The effective deadline is the earliest of caller, resolver,
and transaction/shutdown constraints.

Caller cancellation removes only that waiter. Shared upstream work continues
while another waiter exists. If every waiter cancels and the resolver supports
safe abort, the generation may abort the upstream request. System
`dns.lookup()` remains non-cancellable at the operating-system call boundary.
Sepigs bounds the waiter and prevents late completion from crossing generation
ownership; shutdown rejects the generation waiter even when the underlying
lookup ignores its signal.

Commit never supplies a cancellation signal to old queries. Shutdown may
cancel active and draining generations after the normal shutdown deadline.

## Completion Rules

The promise owner performs one idempotent finalizer:

- remove the key from the same generation Map;
- decrement that generation's active usage;
- close its UDP socket/timer or DoH request;
- write a validated result only to the same generation cache;
- attribute success/failure/timeout to that generation and process counters.

A generation token check prevents late callbacks from writing to another
generation. Cleanup handles success, timeout, parse failure, socket error,
caller cancellation, and shutdown.

## Duplicate Scope

Duplicate joining requires identical normalized name, record type, selected
upstream policy, DNSSEC/validation policy when introduced, and generation.
Static hosts, literal IP addresses, fake-IP allocation, and explicit health
probes do not join ordinary DNS single-flight work.

## Required Tests

- duplicate queries in one generation issue one upstream request;
- the same name across commit issues independent old/new requests;
- old completion cannot populate candidate cache;
- rollback cannot populate restored cache from candidate work;
- timeout and cancellation remove Map entries and resources;
- shutdown aborts bounded work without an unhandled rejection;
- repeated failed reloads leave zero in-flight entries, sockets, and timers.

M8.5 tests prove same-generation merging, cross-generation isolation,
generation-local cache writes, timeout isolation, and old-generation abort
without affecting the candidate. Commit never aborts old work; only shutdown
uses `abortAll()`.
