# Outbound Generation Design

Status: M9 design only. No outbound generation or runtime adapter is
implemented.

## Model

A future immutable `OutboundGeneration` contains:

```text
id
configHash
createdAt
registrySnapshot
policyBindingSnapshot
healthSnapshot
readonly
drainingState
referenceTracking
```

The immutable descriptor owns a read-only map from tag to prepared outbound
object and an identity fingerprint per object. Mutable runtime state is kept in
generation-owned cells:

- setup reference count;
- active stream reference count where the implementation needs it;
- pending UDP operation count;
- pool/session/resource ownership;
- draining and retirement timestamps;
- bounded cleanup errors.

Config hashes are keyed and redacted in persisted evidence. Passwords, private
keys, plugin options, and raw endpoint credentials are never emitted.

## Candidate Construction

Prepare builds the complete registry off to the side. It validates:

- every tag is unique and non-empty;
- every factory exists and is permitted;
- route defaults/rules and policy groups reference candidate tags;
- policy tags do not collide with outbound tags;
- each supported outbound config has a stable identity;
- candidate resources are bounded and teardown-capable.

A tag rename is always remove old plus add new. It is never an in-place rename.
Candidate validation fails if Router/Policy still references the removed tag.

M10 design/prototype initially models generation ownership only. It does not
publish the candidate to live traffic.

## Connection Selection

A future new TCP connection acquires one composite routing/outbound handle:

1. capture Router/Policy and Outbound generation IDs that are compatible;
2. select candidate tags from that Policy generation;
3. resolve each tag in that same Outbound generation;
4. retain a setup reference while `connect()` is pending;
5. after success, transfer ownership according to the outbound capability.

Direct, block, and TCP relay can release the outbound object after setup
because the returned stream owns its socket and immutable behavior. A future
pool, multiplexed transport, plugin RPC stream, or sessionful outbound must
retain an active-stream reference until close.

Existing connections are never migrated, re-routed, or killed by outbound
reload.

## Publication

Commit atomically publishes a compatible Router/Policy/Outbound binding, not
an independent mutable registry map. New setup operations use the candidate.
The old generation becomes draining.

The first limited implementation may admit only outbound-only changes whose
Router/Policy references are unchanged. A transaction that also changes
Router/Policy must stage all three and publish one composite pointer.

DNS and fake-IP are not mutated. A direct outbound may call the stable DNS
resolver, but query generation capture remains the DNS subsystem's concern.

## Removal And Drain

Removing an outbound prevents new lookups in the candidate generation. Old
setup operations retain the old object. Established streams continue on their
existing socket.

The old generation is releasable only when:

- setup references are zero;
- generation-owned active-stream references are zero;
- pending UDP operations are zero;
- pools/transports/timers owned by the generation are drained;
- no prober target references the generation;
- cleanup has reached a terminal recorded state.

No fixed timer may silently destroy an active user connection. A configured
forced-retire policy must be explicit, observable, and excluded from the first
runtime milestone.

## Health And Policy Carry-Over

Health is copied by value only when the outbound identity is unchanged. The
identity includes at least:

- type and tag;
- endpoint/target;
- timeout semantics;
- Shadowsocks method, password fingerprint, and server;
- Trojan password fingerprint, TLS enablement, trust policy, serverName, and
  server;
- plugin owner/type/version when plugin outbounds are later considered.

Failures, successes, last failure, latency EWMA, and recovery timestamp may be
carried for an identical identity. Round-robin cursor, active probe promises,
timers, and mutable backoff ownership are not shared.

Changing failover/load-balance order creates a new Policy generation even if
outbound objects are reused.

## Rollback

Before publication, rollback closes only candidate-owned resources. After
publication, rollback restores the old composite pointer, marks the candidate
draining, and prevents new setup against it.

Rollback does not:

- move a stream between outbounds;
- copy candidate health mutations into old health;
- modify DNS or fake-IP;
- alter inbound listeners;
- reuse a failed candidate pool.

If old publication cannot be restored, runtime enters a visible degraded
state, keeps the safest reachable generation, rejects overlapping reloads, and
requires operator action or restart.

## Protocol Admission

M11's first runtime scope is limited to:

- direct;
- block;
- TCP relay.

Shadowsocks and Trojan require external compatibility, negative auth/cipher/TLS
tests, remote-close tests, and resource evidence before admission. UDP,
WireGuard, plugin outbounds, QUIC, and pooled/multiplexed transports remain
outside this design milestone.

## Required Observability

- active outbound generation sequence;
- draining generation count and oldest drain age;
- setup and active-stream references;
- candidate create/readiness/commit/rollback durations;
- carried/dropped health entries;
- removed outbound with active reference count;
- cleanup and forced-retire outcomes;
- degraded-state gauge and reason code.

Labels are bounded to component, core outbound type, and result code.

## M9 Boundary

M9 defines this model only. It does not add `outbound` to
`transactional-experimental`, change the Engine map, stop an outbound, migrate
a connection, modify DNS/fake-IP, or modify an inbound.
