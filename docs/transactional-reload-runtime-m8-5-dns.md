# Transactional Reload Runtime M8.5: DNS

Status: experimental, default-off DNS generation integration.

## Scope

M8.5 adds `dns` to the explicit `transactional-experimental` allow-list. The
current allow-list is:

- `metrics`;
- `dashboard`;
- `router`;
- `policy`;
- `dns`.

The default reload mode remains `legacy`. DNS participates only when the mode
is `transactional-experimental` and `dns` is listed in
`reload.transactional.enabledComponents`.

Fake-IP is not part of M8.5. Any change to fake-IP enabled state, pool, size,
TTL, or persistence path rejects the DNS transaction before prepare. Inbound,
outbound, UDP session, connection-manager, plugin, RPC, and WASM runtime state
also remain excluded.

## Generation Ownership

`SystemDnsResolver` retains a stable object identity so outbounds created
before reload observe later DNS generations. Its `DNSGenerationStore` owns one
active generation and zero or more draining generations.

A query captures the active generation once. Cache lookup, upstream
selection, single-flight joining, timeout, response validation, cache write,
and reference release remain on that generation. Commit publishes the
candidate pointer atomically. It does not cancel an old in-flight query. The
old generation is released only when query references and single-flight work
both reach zero.

## Cache Carry-Over

Prepare copies positive entries by value only when resolver mode and complete
upstream/config compatibility identity are unchanged and fake-IP is disabled
in both configurations. Copied entries must be unexpired, non-sensitive, and
non-synthetic. Their expiry is never extended and is capped by the candidate
TTL.

Negative cache is not carried by default. Upstream changes, system/UDP/DoH
mode changes, and incompatible policy changes start with an empty ordinary
cache. No single-flight promise is migrated.

## Adapter Lifecycle

`DnsRuntimeAdapter` follows the common transaction contract:

1. `prepare` validates DNS config, rejects fake-IP differences, builds an
   isolated candidate, and applies a bounded cache plan without network I/O.
2. `healthCheck` performs deterministic structural checks only. It has a
   mandatory transaction timeout and performs no public DNS probe.
3. `commit` switches the active generation and marks the previous generation
   draining.
4. `rollback` restores the previous active generation if publication occurred
   and preserves its cache.
5. `cleanup` aborts an unused candidate and releases drained generations on a
   best-effort basis.

DNS is ordered after Router/Policy in the current executor so committed DNS
carry-over counters cannot survive a later Router/Policy commit failure.
Adapters still publish sequentially and roll back on failure; a single
whole-runtime snapshot remains future work.

## DoH And UDP Boundary

Prepare validates DoH URL structure and UDP endpoint references but does not
send traffic. DoH permits `https`, or loopback-only `http`, rejects URL
credentials and fragments, redacts endpoints in errors, and caps response
bodies. UDP queries have bounded timers, abort handling, response ID/question
validation, and source address/port validation for literal-IP upstreams.

Existing DoH/UDP queries remain owned by their starting generation. Candidate
health does not populate the production cache.

## Observability

Experimental mode exports generic per-component prepare/commit/rollback
metrics for component `dns` plus:

- `sepigs_reload_active_dns_generation_id`;
- `sepigs_reload_dns_generation_draining`;
- `sepigs_reload_dns_cache_carry_over_total`;
- `sepigs_reload_dns_cache_dropped_total`;
- `sepigs_reload_dns_rejected_fake_ip_change_total`.

Legacy mode omits these generation metrics. Labels contain no query name,
upstream secret, endpoint credential, or private config value.

## Runtime Smoke

Run the local-only smoke:

```bash
npm run reload:runtime-smoke:dns -- \
  --config examples/sepigs.transactional-dns.experimental.json
```

It starts two loopback UDP DNS fixtures and a loopback TCP echo target, then
checks:

- an old delayed query completes with the old upstream answer;
- the same new query uses the candidate generation and new answer;
- incompatible cache is dropped;
- an established HTTP CONNECT remains open;
- a fake-IP config change is rejected without publication;
- listener and connection counts are unchanged by reload;
- final tracked sockets, timers, listeners, and connections are zero.

Reports are written to:

- `reports/reload/runtime-smoke-dns-latest.json`;
- `reports/reload/runtime-smoke-dns-latest.md`.

## Known Limits

- This is not a whole-runtime transaction and is not production-stable.
- System `dns.lookup()` cannot be cancelled at the OS call boundary; sepigs
  bounds the waiter and prevents late cross-generation writes.
- Public upstream health probing is intentionally absent.
- Negative-cache carry-over is disabled.
- Long-duration mixed DNS reload soak evidence is still required.
- Fake-IP mapping reload remains M10 work and requires separate authorization.
