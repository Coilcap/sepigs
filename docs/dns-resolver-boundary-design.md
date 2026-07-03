# DNS Resolver Boundary Design

Status: M8 design only. Prepare performs no public-network request by default.

## DoH Boundary

### Candidate Validation

Prepare parses and normalizes every endpoint, rejects credentials in URLs,
fragments, unsupported schemes, duplicates, excessive endpoint counts, and
invalid timeout values. HTTPS is required for non-loopback endpoints. Plain
HTTP is permitted only for explicit loopback tests.

The candidate stores a redacted endpoint identity. Logs and events omit URL
userinfo, query strings, fragments, headers, tokens, and full response bodies.

### Client State

Current code creates a Node HTTP/HTTPS request per query and does not own a
dedicated resolver client. A future generation-owned agent/client:

- is rebuilt when URL, TLS trust, proxy, timeout, or validation policy changes;
- is never shared across incompatible generations;
- caps response bytes and concurrent requests;
- validates status, content type, DNS transaction ID, record type, bounds, and
  answer structure;
- closes after the generation drains.

Endpoint changes default to empty positive and negative caches.

### Timeout, Retry, And Fallback

Each endpoint has one bounded attempt inside an overall query deadline.
Retries require an explicit finite budget and backoff; no infinite retry is
allowed. Ordered endpoint failover remains generation-local.

Fallback is a finite directed policy, not recursive resolver re-entry. A
visited-step set or compiled acyclic plan prevents loops. Current
`fallbackHosts` remains a terminal static result and records the upstream
failure separately.

### Health Check And Rollback

Default health check is structural and local-only. It can validate URL/TLS
options and use a mock or loopback DoH server. A public upstream probe requires
explicit config/CLI opt-in, a hard timeout, a concurrency budget, redacted
evidence, and no candidate-cache write.

Rollback restores the old active generation. Candidate requests are normally
absent before commit; any explicit health-check request is cancelled and its
agent closed during cleanup.

## UDP Boundary

### Candidate Validation

Prepare validates unique tags, IP/host syntax, port, timeout, route references,
suffix normalization, endpoint count, and duplicate identities. Validation
does not send a datagram by default.

Changing address, port, route order, or strategy changes resolver identity and
discards negative cache. Positive carry-over requires per-entry selected
upstream metadata; without it, default to discard.

### Socket Lifecycle

Current UDP DNS opens one socket and timer per query and closes both in every
completion path. Under generations:

- each socket is owned by the generation that opened it;
- response source, transaction ID, question, type, and bounds are validated;
- commit does not transfer old sockets;
- old sockets drain with old queries;
- candidate cleanup closes every candidate-owned socket;
- shutdown force-closes remaining sockets after a bounded grace period.

A future shared UDP socket is permitted only with generation-aware
demultiplexing and collision tests. It is not required for the first adapter.

### Timeout, Retry, And Fallback

Every UDP attempt has a timer and overall query deadline. Retries and alternate
servers require a finite budget. Timeout increments generation and process
counters once per defined event, without creating a retry storm.

Rollback leaves old sockets and cache untouched. Candidate structural failure
opens no socket; local health-check sockets must close before rollback ends.

## System Resolver Boundary

System `dns.lookup()` currently lacks a sepigs-owned timeout and cancellation
path. DNS runtime integration must either wrap it with a bounded result policy
and draining ownership or classify non-cancellable work explicitly. Timeout
must not allow a late system result to enter another generation cache.

## Resource And Security Limits

Before implementation, policies must define:

- max DoH response bytes;
- max DNS packet/name/answer counts;
- max endpoints, routes, cache entries, and in-flight queries;
- max concurrent probes and production queries;
- per-attempt and overall deadlines;
- bounded log excerpts with endpoint redaction;
- loopback-only default health checks.
