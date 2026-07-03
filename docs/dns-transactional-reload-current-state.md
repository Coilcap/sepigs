# DNS Transactional Reload Current State

Status: M8 audit only. DNS is not in the runtime transaction allow-list.

## Configuration

`DnsConfig` currently contains:

| Field | Current behavior | Default |
| --- | --- | --- |
| `strategy` | System family selection; custom DoH/UDP A lookup is skipped for `prefer-ipv6` | `system` |
| `cacheTtlMs` | Upper bound for positive A-record cache lifetime | 60 seconds |
| `cacheMaxEntries` | Shared positive/negative LRU-style entry bound | 4,096 |
| `negativeTtlMs` | Failed lookup cache lifetime; zero disables negative caching | 5 seconds |
| `hosts` | Normalized static host-to-address map, checked before cache | empty |
| `udpServers` | Tagged address, port, and timeout definitions | empty |
| `rules` | First matching domain suffix selects a tagged UDP server | empty |
| `fallbackHosts` | Static address returned after resolver failure | empty |
| `doh` | Enabled flag, ordered endpoints, and per-request timeout | disabled |
| `fakeIp` | Enabled flag, pool/range, size, TTL, and optional persistence | disabled |

Schema validation checks numeric bounds, unique UDP tags, and DNS rule
references. DoH endpoint strings are not parsed as URLs until a real query.
The resolver supports A records only.

## Resolver Order

`SystemDnsResolver.resolve()` currently:

1. returns literal IP addresses unchanged;
2. checks `hosts`;
3. checks the instance cache;
4. joins an instance-local single-flight promise for the normalized host;
5. uses ordered DoH endpoints when enabled and not `prefer-ipv6`;
6. otherwise uses one selected UDP server when configured and not
   `prefer-ipv6`;
7. otherwise calls `dns.lookup()` with family 0, 4, or 6;
8. records failure, then returns `fallbackHosts[host]` when present;
9. otherwise stores the error in negative cache and rejects.

DoH tries each configured endpoint once, sequentially. UDP selects the first
matching rule's server or the first configured server and performs one query.
There is no cross-mode retry from failed DoH to UDP/system, or failed UDP to
system. `fallbackHosts` is the only current post-failure fallback.

## Runtime State

| State | Owner | Current lifetime |
| --- | --- | --- |
| Positive and negative cache | Resolver instance | Lost when resolver is replaced |
| Single-flight map | Resolver instance | Promise remains with old resolver/callers |
| DoH request | Individual query using Node HTTP/HTTPS client | Ends on response, timeout, or error |
| UDP socket and timer | Individual query | Closed/cleared by query cleanup |
| System lookup | Node resolver call | No sepigs-owned timeout or cancellation |
| DNS query/failure counters | Process `StatsTracker` | Preserved across resolver replacement |
| Fake-IP pool/store | `FakeIpService` | Reused only for exactly compatible config |

The cache stores positive addresses and negative `Error` objects in one
bounded insertion-ordered Map. Cache hits refresh insertion order. Positive
TTL is the smaller of upstream TTL and `cacheTtlMs`; system results use
`cacheTtlMs`. Negative entries use `negativeTtlMs`. Expired entries are not
served and are replaced by a later result.

Single-flight deduplicates only by normalized hostname inside one resolver
instance. It does not cross resolver instances or query generations.

## Current Reload Behavior

Legacy `Engine.reloadConfig()` replaces `SystemDnsResolver` directly after
publishing routing/config changes and before later Metrics, Dashboard,
plugin, and outbound work completes. This is sequential, not transactional.

The replacement resolver starts with empty ordinary cache and single-flight
maps. Existing callers retain their old promise and resolver through normal
JavaScript references; there is no explicit generation ID, refcount, draining
registry, cancellation, or old-resolver cleanup signal. Completion writes only
to the old resolver's cache.

`fakeIpForReload()` reuses the current `FakeIpService` only when both old and
new fake-IP are enabled and range/cidr, size, TTL, and persistence path are
identical. Otherwise a new service/store is created. This behavior is not
transactional and can lose in-memory reverse mappings after an incompatible
change.

Transactional-experimental mode rejects every DNS or fake-IP difference
before prepare. The existing `dnsAdapter` and `fakeIpAdapter` are shadow-only
prototype adapters and do not construct or publish runtime objects.

## Connection Impact

- Established TCP streams have already selected and connected an outbound;
  DNS replacement does not re-resolve or migrate them.
- An in-progress outbound connection can be waiting on the old resolver and
  completes against that resolver.
- New outbound resolution after publication would use the new resolver.
- UDP packets may cause new resolution and therefore need explicit generation
  ownership before DNS joins a runtime transaction; UDP session migration is
  outside M8.
- Fake-IP reverse lookup occurs in Engine before Router matching. Losing a
  mapping can turn a fake address into an IP route and select the wrong target.

## Observability

Prometheus currently exposes cumulative process counters:

- `sepigs_dns_queries_total`
- `sepigs_dns_failures_total`
- `sepigs_fake_ip_assignments_total`

Queries count uncached resolver work, not cache hits or static hosts. A
fallback-host success still increments DNS failures. There are no cache
hit/miss, negative-cache, per-upstream, latency, timeout, in-flight, or
generation metrics.

## Current Risks

- Legacy reload can expose partial state if a later component fails.
- Ordinary cache continuity is always lost, which can create a query burst.
- In-flight queries are not observable or explicitly drained.
- System DNS has no sepigs-owned timeout/cancellation.
- DoH buffers the full response and does not enforce a response-size limit.
- DoH logs the configured endpoint; URL userinfo/query material could leak.
- UDP validates transaction ID and DNS structure but does not bind acceptance
  to the expected response source.
- Failed DoH/UDP does not fall through to another resolver mode.
- There is no retry budget/backoff model beyond ordered DoH endpoints.
- Cache entries do not retain source/upstream identity, so safe migration
  cannot be proven from current entries.
- Fake-IP mapping reuse is compatibility-based but not staged or rolled back.
- DNS and fake-IP share one config object despite requiring different runtime
  ownership and promotion milestones.
