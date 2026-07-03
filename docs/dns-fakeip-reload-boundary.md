# DNS And Fake-IP Reload Boundary

Status: M8 boundary design. Fake-IP runtime reload remains deferred to M10.

## Ownership Split

Ordinary DNS cache maps a domain to a real upstream/system address.
`FakeIpService` maps a domain to a synthetic pool address and maintains the
reverse address-to-domain mapping. They are separate stores and must never
share entries or migration code.

M8 DNS generation may own resolver config, ordinary cache, single-flight, and
resolver resources. It does not own:

- fake-IP range/pool cursor;
- domain/address mapping store;
- mapping TTL or LRU order;
- persistence file;
- assignment counters;
- reverse lookup lifetime.

## Change Classification

| Fake-IP change | DNS-only transaction result |
| --- | --- |
| No change | DNS candidate may proceed |
| Enable or disable | Reject as high risk / restart required |
| Range or CIDR | Reject; future M10 staged drain or restart |
| Size | Reject; mapping capacity/eviction semantics change |
| Mapping TTL | Reject; existing mapping lifetime changes |
| Persistence path | Reject; store identity changes |

No fake-IP change is silently ignored, copied, reset, or folded into DNS cache
carry-over. The dry-run/shadow plan must report it as `fake-ip-store`, not
`dns`.

## Reverse Lookup Invariant

Engine restores a fake address to its domain before Router matching. For every
accepted connection using a fake address:

```text
address -> original domain -> router decision -> real DNS resolution
```

must remain coherent. DNS publication cannot remove or replace the reverse
mapping used by an existing or newly accepted fake address. A fake-IP pool
range change can make the same address mean a different domain and therefore
requires restart or a future M10 generation drain.

Router/Policy M7 and DNS future generations may be composed only after tests
prove that domain restoration occurs before the captured Router and DNS
generation decisions. M8 design does not change that Engine boundary.

## Cache Isolation

- `resolveForClient()` fake allocation does not populate ordinary DNS cache.
- `resolve()` real-address results never enter fake-IP store.
- Ordinary positive/negative cache carry-over excludes fake addresses and
  fake-IP pool metadata.
- Enabling/disabling fake-IP invalidates any proposed DNS carry-over plan.
- A persisted fake-IP file is never read, written, renamed, or deleted by a
  DNS adapter.

## Rollback

DNS rollback restores the old DNS generation while leaving the active
`FakeIpService` object untouched. Candidate DNS cleanup has no reference that
can mutate fake-IP mappings. If a transaction includes a fake-IP difference,
it is rejected before DNS prepare until M10 explicitly authorizes coordinated
ownership.

## M10 Preconditions

Future fake-IP runtime work requires mapping snapshots, compatibility
classification, bidirectional uniqueness checks, persistent-store atomicity,
active connection/session ownership, range-change drain behavior, and reverse
lookup continuity under rollback. None is claimed by M8.
