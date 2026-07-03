# DNS Reload Risk Matrix

Status: M8.5 implementation evidence added. Soak and full composite
transaction risks remain open.

| ID | Risk | Severity | Likelihood | Detection | Mitigation | Rollback strategy | Test needed |
| --- | --- | --- | --- | --- | --- | --- | --- |
| D1 | Invalid system/UDP upstream publishes | High | Medium | Prepare validation and candidate selection corpus | Normalize and validate every endpoint/reference before publication | Keep old generation | Invalid address/tag/port cases |
| D2 | Invalid DoH URL or scheme reaches query path | High | Medium | URL parser and redacted identity audit | HTTPS for non-loopback; reject credentials/fragments/unsupported schemes | Discard candidate | URL/scheme/userinfo matrix |
| D3 | DoH TLS or HTTP failure blocks reload | High | Medium | Bounded health result and timeout event | Local-only default health check; explicit finite probe | Cancel candidate request; old remains active | TLS, status, timeout, malformed body |
| D4 | UDP timeout/socket error leaks resources | High | High | Socket/timer counts by generation | Per-attempt deadline and idempotent cleanup | Close candidate sockets; old remains | Timeout, send error, late packet |
| D5 | Poisoned/stale positive cache is carried | Critical | Medium | Source/upstream identity and expiry audit | Copy only compatible unexpired entries by value | Drop candidate cache | Upstream/route/mode change corpus |
| D6 | Stale negative cache suppresses recovery | High | High | Negative source/policy metadata | Default discard on upstream/mode/fallback change; shorten TTL | Restore untouched old cache | NXDOMAIN/error then config change |
| D7 | Single-flight entry leaks after timeout | High | Medium | Active query and Map-size metrics | Generation-local key, one finalizer, bounded abort | Drain/force-close candidate | Timeout/cancel/shutdown repetition |
| D8 | Query joins work from another generation | Critical | Medium | Generation ID assertion in test harness | Never share or migrate single-flight Maps | Restore old pointer; discard candidate result | Same name across commit/rollback |
| D9 | In-flight result writes to wrong cache | Critical | Medium | Cache owner token and event correlation | Capture generation once; write only to owner cache | Drop late candidate result | Delayed old/new completion ordering |
| D10 | Fallback policy loops or retries forever | Critical | Low | Compiled policy graph and attempt counter | Acyclic finite plan, visited set, total deadline | Abort candidate query | Cyclic config and retry-budget tests |
| D11 | Failure counters reset and cause retry storm | High | Medium | Monotonic process counters and rate alert | Preserve cumulative counters; carry backoff only by unchanged identity | Restore old health/backoff state | Reload under failed upstream load |
| D12 | Fake-IP mappings are reset by DNS reload | Critical | Medium | Fake-IP identity and mapping-count guard | Reject every fake-IP difference; adapter has no store access | Old store remains untouched | Enable/range/size/TTL/path changes |
| D13 | Fake-IP reverse lookup becomes inconsistent | Critical | Medium | Address-domain-route continuity probe | Separate stores; M10 staged drain for pool changes | Reject transaction/restart | Active fake address across DNS reload |
| D14 | Router uses IP after mapping loss | Critical | Low | Route decision evidence for fake address | Preserve fake store and restore domain before captured route/DNS decisions | Keep old composite state | Domain-rule vs IP-rule regression |
| D15 | Rollback leaves candidate active or mixed | Critical | Medium | Active generation gauges and pointer assertion | Single atomic pointer/composite snapshot, idempotent rollback | Restore old generation and drain candidate | Fault around publication boundary |
| D16 | Old query is cancelled on commit | High | Medium | Long-running local resolver probe | Commit never aborts old generation | Continue old query to completion | Delayed DoH/UDP through commit |
| D17 | Generation caches grow without bound | High | Medium | Cache/generation count and heap trend | Per-generation capacity; bounded draining deadline; no shared Map | Retire candidate/old after usage zero | Repeated reload/cache-pressure soak |
| D18 | DoH response/log exposes secret or memory | Critical | Medium | Security scan and response byte counter | Redact URL material; cap body and logs | Abort/close candidate request | URL token and oversized body |
| D19 | UDP accepts spoofed response source | High | Medium | Endpoint/source assertion | Validate remote address/port plus transaction/question | Ignore invalid packet until timeout | Wrong source/ID/question packets |
| D20 | System lookup outlives generation indefinitely | High | Medium | Draining age and active-query alert | Bounded wrapper/classification and late-write owner guard | Retain bounded old state or escalate shutdown | Hung/late system lookup fixture |

## Promotion Rule

Critical rows require automated failure-injection evidence before promotion
beyond experimental. High risks require a documented mitigation plus unit
or runtime evidence. A dry-run or shadow result alone does not close a runtime
ownership risk.

## M8.5 Evidence

- D1/D2: adapter tests reject invalid UDP and DoH configuration before
  publication.
- D5/D6: carry-over tests cover compatibility, expiry, TTL shortening,
  sensitive/synthetic entries, and default negative-cache discard.
- D7-D9/D16: generation and single-flight tests cover drain, timeout,
  cancellation, and old/new cache ownership.
- D12/D13: runtime integration rejects fake-IP changes before DNS prepare and
  leaves the mapping service untouched.
- D15: adapter and Engine tests restore the old generation and cache after
  rollback.
- D17: generation release and runtime smoke assert drained state and final
  resource cleanup.

D3/D4/D10/D11/D14/D18 and long-duration memory behavior remain promotion
risks. M8.5 is experimental, not production-ready.
