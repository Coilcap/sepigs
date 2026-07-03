# DNS Generation Design

Status: M8.5 implemented behind the explicit, default-off
`transactional-experimental` DNS allow-list.

## Model

The immutable `DNSGeneration` descriptor contains:

```text
id
configHash
createdAt
upstreams
dohUpstreams
cachePolicy
negativeCachePolicy
singleFlightPolicy
fallbackPolicy
timeoutPolicy
failureCountersSnapshot
```

All arrays, maps, policies, and metadata are cloned and frozen before prepare
completes. `configHash` is a keyed hash over the complete canonical DNS
resolver semantics, including authentication-sensitive endpoint material when
present, so meaningful changes cannot collide by redaction. It excludes
fake-IP config, mutable cache contents, counters, and in-flight request state.
The key and raw material are never persisted; reports use a redacted
generation identifier, not raw configuration labels.

The immutable descriptor is paired with generation-owned runtime state:

- positive and negative caches;
- single-flight map;
- active query count and usage marker;
- optional dedicated DoH agent/client;
- UDP query socket factory and owned active sockets;
- generation-local metric deltas.

Mutable runtime state is encapsulated and cannot alter descriptor fields.
Process-wide cumulative DNS counters remain monotonic.

The implementation is in `src/dns/generation.ts` and
`src/dns/generationStore.ts`. Descriptor arrays and policies are cloned and
frozen. Cache, single-flight, reference counts, and draining state are
generation-owned mutable runtime state and are not exposed for direct
mutation.

## Publication And Lifetime

New DNS queries acquire the active generation exactly once. Cache lookup,
upstream selection, single-flight joining, response validation, cache write,
and metrics attribution use that captured generation.

Commit atomically swaps one active generation pointer. Existing in-flight
queries remain bound to the old generation and are not cancelled by commit.
The old generation becomes `draining` until:

- active query count is zero;
- its single-flight map is empty;
- all UDP sockets and request timers are closed;
- any generation-owned DoH agent is idle and closed;
- no cache migration reader still references it.

Rollback before publication discards the candidate and leaves the old pointer
unchanged. If publication has occurred and a later transactional component
fails, rollback restores the old pointer and drains/discards the candidate.
Rollback never copies candidate query results into the old generation.

Shutdown is the only normal operation allowed to cancel both active and
draining generations.

## M8.5 Runtime Evidence

`SystemDnsResolver` keeps a stable object identity because existing outbound
instances retain that resolver. Reload atomically switches the resolver's
internal `DNSGenerationStore`; replacing only the Engine field would not
affect those outbounds. A query acquires one generation handle before cache
lookup and releases it in a `finally` block.

Unit and runtime tests cover active switching, rollback, query references,
single-flight drain, cache isolation, and old/new local UDP answers across a
commit. No fake-IP store reference is held by a generation.

## Resolver Identity

Carry-over decisions use a stable resolver identity composed of:

- strategy and record family;
- normalized static hosts and fallback hosts;
- ordered DoH endpoint identities and TLS policy;
- ordered UDP server address/port/timeout identities;
- DNS route-rule order and normalized suffixes;
- response validation policy;
- positive and negative TTL policies.

Public endpoint identities redact userinfo, query parameters, and fragments;
compatibility comparison uses a non-persisted keyed fingerprint of the full
normalized identity.
Changing fake-IP is not part of resolver identity because it is not a DNS
generation operation; such a candidate is rejected or classified separately.

## Cache Policy

The candidate receives a frozen carry-over plan during prepare. It never
shares a mutable cache Map with the old generation.

- Identical resolver identity: copy valid positive entries, bounded by the new
  capacity and shortened by the new TTL ceiling.
- Changed upstream/route/strategy: default to empty positive cache.
- Changed DoH/UDP mode or resolver identity: empty negative cache.
- Identical negative semantics: negative entries may be copied only after
  explicit M8.5 tests prove source and expiry metadata.
- Fake-IP state change: reject DNS-only publication and copy no cache.

The first implementation should prefer copying entries into an isolated
candidate cache over shared or copy-on-write cache complexity.

## Failure Counters

`failureCountersSnapshot` is a read-only baseline captured at prepare for
observability and retry-budget reasoning. Process cumulative counters are
never reset. Candidate generation-local counters start at zero and are added
to process counters as events occur.

If future backoff or circuit state is introduced, it may carry over only for
an unchanged upstream identity. Failure count must not reset in a way that
causes a retry storm, and stale failure state must not disable a different
upstream.

## DoH And UDP Resources

Current UDP uses one socket per query, so an old generation drains by waiting
for those sockets. A future shared UDP socket must be generation-owned and
demultiplex by generation plus query ID.

Current DoH uses Node HTTP/HTTPS requests without an explicit generation-owned
agent. A future dedicated agent is rebuilt when endpoint, TLS, proxy, timeout,
or trust policy changes. It is never shared across incompatible generations.

## Fake-IP Exclusion

`DNSGeneration` does not own `FakeIpService`, its pool, store, persistence
path, or mappings. Engine may compose a DNS generation and fake-IP generation
in a later whole-runtime snapshot, but M8 design does not authorize that
runtime composition.
