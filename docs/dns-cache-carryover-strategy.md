# DNS Cache Carry-Over Strategy

Status: M8.5 implemented for experimental DNS transactions. Legacy DNS
replacement retains its previous empty-cache behavior.

## Options

### 1. Discard Everything

Create the candidate with empty positive and negative caches.

Advantages: simplest rollback and no stale-source contamination. Disadvantages:
reload can create a DNS burst, latency spike, and upstream rate-limit pressure.
This is the safe fallback whenever compatibility cannot be proven.

### 2. Safe Carry-Over

Copy only unexpired positive entries whose resolver identity, record type,
source kind, and upstream identity are unchanged. Never share mutable entries
or Maps. This requires source metadata that current cache entries do not hold.

### 3. Conditional Carry-Over

Classify each config difference:

| Change | Positive cache | Negative cache |
| --- | --- | --- |
| Capacity only | Copy valid entries, evict to new bound | Copy only if negative policy unchanged |
| Positive TTL only | Copy and shorten expiry | Unchanged policy only |
| Static `hosts` change | Do not cache static hosts; invalidate matching dynamic names | Drop matching negatives |
| Fallback map change | Dynamic positive entries may remain if upstream identity is unchanged | Drop affected negatives |
| DNS route rule change | Copy only entries whose selected upstream identity is unchanged | Drop affected/all negatives |
| Upstream order/address change | Default discard | Discard |
| System/UDP/DoH mode change | Default discard | Discard |
| Strategy/family change | Discard incompatible record family | Discard |
| Fake-IP enable/pool/store change | Reject DNS-only transaction | Reject DNS-only transaction |

### 4. Generation Cache

Every generation owns independent caches. Candidate carry-over is a bounded
copy during prepare. Old caches remain available only to old in-flight
queries and are released when the old generation drains. This is the
recommended ownership model.

### 5. TTL Shortening

Carry-over never extends an entry. Candidate expiry is:

```text
min(oldExpiresAt, candidateCreatedAt + candidatePositiveTtlCeiling)
```

Expired entries are skipped. If upstream TTL/source metadata is available,
its original expiry remains another upper bound. Capacity eviction preserves
most-recently-used ordering without exceeding the candidate bound.

### 6. Negative Cache

Negative answers are more sensitive to resolver behavior and fallback policy.
The first implementation should discard them unless all of these are
identical:

- strategy and record family;
- selected upstream identity and route;
- DoH/UDP/system mode;
- response validation semantics;
- fallback-host value;
- negative TTL policy.

Even when compatible, expiry is shortened and never extended. Any DoH/UDP
mode change discards negative cache by default.

### 7. Single-Flight

Promises are never migrated or joined across generations. A copied cache entry
must come from a completed result captured before candidate publication, not
from an in-flight promise. Old query completion writes only to the old cache.

## Recommendation

M8.5 uses generation-owned caches and a bounded copy during prepare:

- compatible resolver mode and compatibility hash: copy unexpired positive
  entries by value;
- expiry is never extended and is capped by the candidate positive TTL;
- negative entries are dropped unless an explicit future safe policy enables
  them;
- expired, sensitive, and synthetic entries are dropped;
- upstream identity or system/UDP/DoH mode changes drop all ordinary cache;
- every fake-IP config difference rejects the whole DNS-only transaction.

The candidate cache is never shared with the active generation. In-flight
promises are never copied. Metrics count carried and dropped entries only
when the DNS adapter commits.

Use isolated per-generation caches with conditional positive carry-over:

1. If the resolver/upstream identity is unchanged, copy valid positive entries
   by value, apply the candidate capacity, and shorten TTL.
2. If upstream, route, strategy, or DoH/UDP mode changes, start with an empty
   cache until entry source metadata supports a proven narrower rule.
3. Do not carry negative cache across mode/upstream/fallback changes.
4. Treat static hosts as candidate config, not dynamic cache.
5. Never migrate fake-IP mappings through DNS cache carry-over.
6. Reject fake-IP enable, range, size, TTL, or persistence changes from a
   DNS-only transaction.

This recommendation favors a predictable query burst over stale or poisoned
answers when compatibility is uncertain.
