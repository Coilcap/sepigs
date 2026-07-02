# DNS And Fake-IP Transactional Reload Design

Status: M8/M10 design only. M6 adds no runtime adapter.

## DNS Candidate

The candidate resolver contains new system strategy, UDP upstreams, DoH
endpoints, routing rules, hosts, fallback hosts, and cache policy. Prepare:

1. validates every upstream, timeout, rule reference, and loopback/security
   boundary;
2. constructs candidate clients without publishing them;
3. performs bounded readiness probes only when explicitly enabled for tests;
4. classifies cache entries as reusable, expired, incompatible, or
   generation-owned;
5. leaves old in-flight lookups attached to the old resolver.

An upstream or DoH change does not cancel old single-flight promises. New
queries after commit use the candidate resolver; callers already awaiting an
old promise receive that old result. A single-flight map is never copied
between resolvers.

## Cache Retention

Positive entries may carry over only when:

- the host/static routing semantics are unchanged;
- the address family strategy remains compatible;
- the entry has not expired;
- candidate TTL caps its remaining lifetime;
- the entry is not a fake-IP answer.

Negative entries carry over only when the upstream selection, fallback, and
negative-cache policy are unchanged. Their remaining TTL is capped by the
candidate negative TTL. Upstream or fallback changes invalidate negative
entries so an old failure does not mask a newly valid answer.

LRU order may be rebuilt deterministically, and candidate `cacheMaxEntries`
is enforced during prepare. Migration must remain bounded and cannot retain
unbounded host keys.

DNS query/failure counters remain process-level monotonic metrics. Cache hit
state and single-flight promises remain generation-owned. Fallback behavior is
fully candidate-defined after commit; fallback validation failure prevents
publication.

## DNS Rollback

Before commit, failure closes candidate-owned clients/timers and keeps old
resolver, cache, and in-flight promises. After commit, old resolver resources
drain when no in-flight request references them. Late old results must not be
inserted into the candidate cache.

DoH TLS/HTTP failure, UDP timeout, malformed response, or readiness failure
must be reported without silently selecting a different candidate upstream
unless that fallback is explicitly configured.

## Fake-IP Store

Fake-IP is a separate state transaction, not an ordinary DNS cache.

Required compatibility checks include:

- pool CIDR/range and effective size;
- TTL semantics;
- persistence path and store format/version;
- address-to-domain and domain-to-address uniqueness;
- every live mapping's containment in the candidate pool;
- router reverse-lookup boundary;
- active TCP/UDP references to mapped addresses.

Identical pool semantics may reuse the existing store. TTL changes may apply
only to new mappings unless an explicit, tested migration policy recalculates
existing expiry without resurrecting expired rows.

A pool range/size change defaults to `restart-required` or staged drain. It
must not silently discard or remap live entries. Persisted state replacement
requires atomic file replacement, format validation, fsync policy, and
rollback to the previous file/reference.

## Reverse Lookup Consistency

An accepted fake-IP address must resolve through the same mapping generation
that assigned it. Router integration receives the restored domain before
route matching. During staged drain:

- old mappings remain readable for active and recently issued addresses;
- new allocations come only from the candidate pool after commit;
- the same address cannot mean different domains across live generations;
- fake-IP answers never enter the real positive/negative DNS cache.

Active connections are not remapped. UDP associations require explicit
mapping-generation ownership before fake-IP runtime reload can enter M10.

## Restart And Drain Rules

Full restart or explicit staged drain is required when:

- pool ranges overlap with changed meaning;
- a live old address is outside the candidate pool;
- persistence format/path migration cannot be atomic;
- store integrity or bidirectional uniqueness fails;
- mapping ownership for active UDP sessions is unknown.

M8 may implement DNS and fake-IP shadow classification. Fake-IP runtime
publication remains reserved for M10.
