# UDP And Plugin Reload Risk Review

Status: design risk review only. UDP is excluded from M7; plugins are excluded
from M7 and M8 and require M11.

## UDP Session Risks

UDP is connectionless at the transport layer but stateful in sepigs. Each
association owns:

- client/source identity and relay/NAT mapping;
- route, outbound, DNS, and fake-IP decisions;
- idle timeout and close callback;
- packet/error counters and resource-limit capacity;
- one or more UDP sockets depending on outbound behavior.

A reload must bind every session to one generation. Packets for an existing
session continue through its old router/outbound/fake-IP mapping until that
session expires or closes. New sessions use the candidate generation.

DNS-over-UDP is a special case because query IDs, timeout timers, upstream
selection, and socket close race with reload. Late responses must return only
to the query/session that owns them and must not populate a candidate cache.

Fake-IP UDP routing compounds the risk: reverse lookup must use the mapping
generation that assigned the address. Rebinding to a candidate store could
send a datagram to the wrong domain.

Amplification and abuse limits must not reset during reload. Candidate limits
cannot temporarily double socket/session capacity while old generations
drain.

Rollback is difficult because session/NAT state cannot be copied safely after
packets have flowed through a candidate. The preferred model is generation
pinning and drain, not live session migration. M10 requires timeout, malformed
packet, resource pressure, and final socket/timer/session-zero evidence.

## Plugin Ownership Risks

Plugin reload spans code, permissions, factories, and external runtimes:

- in-process module callbacks may have irreversible global side effects;
- worker/child runners own processes, IPC listeners, and pending request IDs;
- remote factory registrations are owner-scoped but active calls reference the
  old runner;
- WASM instances own linear memory and imported host capabilities;
- permission changes alter what a plugin may register or access.

Candidate setup must use a new owner namespace. It cannot publish factories
until manifest/API/permission validation and health checks pass. Old factories
remain available to old in-flight requests until drain completes.

An in-flight RPC request needs a bounded outcome when commit occurs:

- complete against the old runner;
- fail once with a typed reload/runner error after timeout;
- never be replayed automatically if the operation may have side effects.

Candidate crash before commit unregisters only candidate factories and leaves
old runners active. Crash after publication is a runtime failure, not a reason
to resurrect a partially unloaded old plugin. Permission expansion requires
fresh approval/validation; permission reduction applies to new requests after
commit and old privileged requests drain within a deadline.

## Rollback And Unload Safety

Plugin rollback is allowed only when setup, start, stop, registration, and
cleanup are idempotent and owner-scoped. A manifest must declare irreversible
effects or unsupported unload, causing `restart-required`.

M11 must test:

- factory namespace publication and removal;
- worker/child crash during every lifecycle phase;
- RPC timeout and response-after-timeout;
- permission change rejection and rollback;
- WASM trap and memory cleanup;
- no process, worker, listener, timer, factory, or callback residue.

Plugin reload requires its own M11 threat model. A green generic executor test
or shadow run is not sufficient authorization.
