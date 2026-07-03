# DNS Runtime Adapter Design

Status: implemented in M8.5 behind explicit
`transactional-experimental.enabledComponents: ["dns"]`.

## Runtime Contract

The adapter implements `ReloadableComponent` and owns one candidate
`DNSGeneration`, carry-over plan, local validation evidence, and candidate
resources. It must not mutate `SystemDnsResolver` in place.

## Prepare

`prepare(config, context)`:

1. isolate DNS config from fake-IP config;
2. reject any fake-IP difference from the active config;
3. parse and normalize system, UDP, DoH, route, fallback, TTL, and limit
   policies;
4. validate endpoint references and bounded values;
5. build an immutable candidate descriptor and isolated runtime state;
6. snapshot process/upstream failure counters without resetting them;
7. classify each old cache entry as copy, drop, or expired;
8. copy only approved entries by value into the bounded candidate cache;
9. register candidate-owned resources without publishing them.

Prepare does not issue a real public DNS query, mutate the active resolver,
share a single-flight Map, write fake-IP persistence, or alter process routing.

## Health Check

Default health check is local-only:

- deterministic host/rule/upstream selection;
- DoH URL, scheme, redaction, request-limit, and response-parser validation;
- UDP packet encoder/decoder and endpoint validation;
- cache/carry-over invariant checks;
- mock or loopback resolver exchange when explicitly configured.

An optional public upstream probe is disabled by default and requires explicit
authorization, bounded concurrency, one overall deadline, no retry loop,
redacted logs, and no production cache write. Results are captured in the
transaction event log using bounded error classes, not endpoint secrets.

## Commit

Commit atomically publishes the candidate DNS generation. Queries starting
after publication use it. Queries already holding the old generation continue
without migration. The old generation is marked draining; no connection,
inbound, outbound, UDP session, Router/Policy generation, or fake-IP store is
changed.

If DNS participates in a future larger transaction, publication occurs only
through the same composite runtime snapshot discipline used to prevent mixed
Router/Policy generations.

## Rollback

Before publication, rollback discards candidate cache/resources and leaves the
old active generation untouched. After partial publication, it restores the
old pointer, marks the candidate draining, and prevents candidate results from
writing to old cache.

Old cache and single-flight state remain intact. Process counters remain
monotonic. Rollback is idempotent and uses a fresh bounded recovery context.

## Cleanup

Cleanup:

- aborts candidate health-check work;
- closes candidate DoH agents and UDP sockets;
- clears candidate timers and single-flight entries when safe;
- drops unpublished candidate cache;
- retires old draining state only after active queries reach zero;
- records cleanup timeout/leak evidence.

Cleanup never deletes fake-IP persistence or closes shared process resources.

## Implemented Limits

- Health checks are structural and local-only; reload sends no public probe.
- DoH endpoints require HTTP or HTTPS, reject credentials/fragments, and only
  allow plaintext HTTP on loopback.
- DNS is published last among the currently supported runtime adapters so a
  later Router/Policy commit cannot invalidate committed DNS carry metrics.
- The existing executor still commits component adapters in sequence and
  rolls them back on failure; whole-runtime snapshot publication remains
  future work.
- No inbound, outbound registry, UDP session, connection-manager, plugin, or
  fake-IP runtime state participates.

## Required Host API

A future host should expose narrow ownership methods:

```text
activeDnsGeneration()
publishDnsGeneration(candidate)
restoreDnsGeneration(old)
dnsFailureCountersSnapshot()
fakeIpCompatibilityView()
```

It must not expose mutable resolver internals or general Engine replacement.

## Failure Semantics

Invalid config, health timeout, resource setup failure, publication failure,
and cleanup failure are separate event/error stages. No automatic legacy
fallback runs after failure. The active generation and query ownership remain
observable in metrics without hostname or endpoint labels.
