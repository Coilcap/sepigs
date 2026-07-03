# Outbound And Inbound Reload Risk Matrix

Status: M10 prototype evidence added. No row authorizes runtime integration.

Likelihood and severity are Low, Medium, High, or Critical. Critical severity
or High/High blocks runtime admission until automated evidence exists.

| ID | Risk | Severity | Likelihood | Affected component | Detection | Mitigation | Rollback strategy | Required tests | Target |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| O1 | Removed outbound still has pending/active connections | Critical | High | Registry/connection | Generation refs and connection attribution | Keep old object/resources draining; never migrate or kill | Restore old composite pointer; candidate drains | Remove under pending connect and long stream | M10/M11 |
| O2 | Outbound tag rename is treated as in-place update | High | Medium | Registry/router/policy | Candidate identity diff and reference validation | Classify remove + add | Reject before prepare if stale reference exists | Rename with default/rule/policy refs | M10 |
| O3 | Policy references missing outbound | Critical | Medium | Router/policy/registry | Compile candidate composite snapshot | Validate complete tag graph before construction | Old snapshot stays active | Missing default/rule/policy target corpus | M10 |
| O4 | Health state carried to a different endpoint/security identity | High | Medium | Policy health | Identity fingerprint mismatch | Carry by value only for exact identity | Drop candidate health; old untouched | Same tag with changed server/cipher/TLS | M10 |
| O5 | Prober reset causes retry storm or stale timer writes | High | Medium | Prober/policy | Probe owner generation and timer counters | Do not share promises/timers; bounded cold start/backoff | Stop candidate prober; retain old snapshot | Late probe, backoff, repeated reload | M11 |
| O6 | Shadowsocks cipher/password mismatch is published | Critical | Medium | Shadowsocks outbound | Reference handshake and negative cipher/password cases | Treat crypto identity as non-reusable; external gate | Keep old generation; destroy candidate crypto/resources | Three ciphers, wrong password, large payload, close | M13 |
| O7 | Trojan TLS/SNI/trust boundary is misclassified | Critical | Medium | Trojan outbound | Real TLS reference handshake and certificate evidence | Fingerprint TLS policy; no plaintext equivalence claim | Keep old TLS object/generation | SNI, trust failure, password, close, payload | M13 |
| O8 | TCP relay target change affects an old stream | High | Low | TCP relay | Connection/generation evidence and echo endpoints | Stream owns established socket; new setup uses candidate | Restore old registry for new setup | Old/new target split with long stream | M11 |
| O9 | Failover group reorder mixes policy and registry revisions | Critical | Medium | Policy/registry | Composite generation IDs per decision | Publish Router/Policy/Outbound together | Restore one old composite pointer | Reorder during connection load | M11 |
| O10 | Partial registry switch cannot roll back | Critical | Medium | Runtime integration | Fault at every construction/commit index | Candidate map plus one-use publication token | Restore old pointer; degraded if impossible | Inject factory/commit/cleanup failures | M10/M11 |
| O11 | Candidate pool/timer/socket leaks after prepare failure | High | Medium | Outbound resources | Resource inventory and leak detector | Transaction-owned resources and idempotent cleanup | Close candidate only | Repeated failed prepare with final zero counts | M10/M11 |
| O12 | UDP operation outlives removed outbound | Critical | High | UDP/Shadowsocks | UDP operation generation refs | Exclude UDP from first runtime scope | Reject transaction or retain generation | Pending datagram/timeout/close | M14 |
| I1 | Candidate port conflict disrupts old listener | Critical | High | Inbound listener | Bind error and old listener continuity probe | Candidate-first on different address; no old mutation | Stop candidates; old keeps accepting | Occupied port and partial multi-listener prepare | M12 |
| I2 | Public bind starts without valid auth/security | Critical | Medium | Inbound/security | Normalize bind and run policy before socket creation | Reject pre-bind; loopback default | No candidate resource exists | `0.0.0.0`/`::` auth matrix | M12 |
| I3 | Auth change affects active clients or same-address update is unsafe | High | High | HTTP/SOCKS auth | Generation handshake attribution | Auth snapshot per accepted connection; same-address policy | Keep old acceptor or classify restart-required | Existing tunnel plus old/new credentials | M12 |
| I4 | Listener readiness is a false positive | High | Medium | Inbound protocol | Bounded protocol/auth probe | Require protocol readiness, not just `listening` | Stop candidate; old stays active | Listen succeeds but handshake/auth fails | M12/M13 |
| I5 | Drain never completes | High | High | Inbound/connection | Drain age and references | Soft deadline, alert, bounded retained generations | Keep draining; no silent force-close | Long stream and idle/close transitions | M12 |
| I6 | Old listener cannot be restored after commit rollback | Critical | Medium | Inbound rollback | Rebind/resume fault injection | Stable acceptor or explicit restart-required same-address path | Enter visible degraded state | Failure immediately after old accept closes | M12 |
| I7 | Mobile clients create reconnect storm during switch | High | Medium | Inbound/limiter | Accept/reject rate and limiter metrics | Candidate ready first, jittered client guidance, resource caps | Keep old listener when candidate unhealthy | Burst reconnect/load test | M13 |
| I8 | SOCKS5 UDP ASSOCIATE becomes orphaned | Critical | High | SOCKS5/UDP manager | TCP control, UDP socket, session owner correlation | Exclude UDP from M12; generation model in M14 | Preserve old owner; never migrate silently | Active association across listener drain | M14 |
| I9 | Shadowsocks/Trojan inbound restart breaks active crypto/TLS streams | Critical | Medium | Protocol inbound | External clients and generation attribution | Retain old handler/context per connection | Drain old; stop candidate accepts | Long encrypted/TLS streams and reconnect | M13 |
| I10 | Failed prepare leaks listener/socket/timer or secret material | Critical | Medium | Inbound resources | Leak/security scan and resource inventory | Candidate ownership, bounded logs, idempotent teardown | Stop all staged resources | Multi-listener partial failure and TLS file error | M12/M13 |
| I11 | Lifecycle registry diverges from active inbound map | High | Medium | Engine lifecycle | Compare active/listed/registered generations | Publish and lifecycle-register as one transaction | Restore old registry; degraded on mismatch | Fault around registration/publication | M12 |
| I12 | Same-address listener change has hidden outage | Critical | High | Inbound bind | Availability probe and outage timer | Stable acceptor or explicit unsupported/restart classification | Keep old listener before any close | Auth/TLS/protocol change on same host/port | M12 |

## Promotion Rules

- M10 is generation model plus dry-run/shadow only. It cannot close or publish
  an outbound.
- M11 admits only direct, block, and TCP relay after O1-O5 and O8-O11 have
  automated evidence and a soak gate.
- M12 admits only HTTP/SOCKS5 TCP on supported bind transitions after I1-I6,
  I10-I12 have automated evidence.
- M13 requires external Shadowsocks/Trojan compatibility and mobile reconnect
  evidence.
- M14 owns UDP/fake-IP/session risks O12 and I8.

Rollback failure always sets an observable degraded state. A report that omits
or converts degraded to success is an acceptance failure.

## M10 Prototype Evidence

- O2: rename is emitted as remove plus add, with no implicit in-place identity.
- O3: missing default and policy references reject the candidate.
- O4: health snapshots copy by value; changed secret/endpoint identity is
  classified without exposing values.
- O6/O7: Shadowsocks/Trojan are medium risk and excluded from M11 assessment.
- O10/O11: the prototype creates no runtime object/resource, and tests prove
  the registered factory is not invoked.
- O1: shadow warns when a removed tag has an active simulated reference.

O1 runtime drain, O5 prober ownership, O8 TCP relay continuity, O9 composite
publication, O10 rollback, and O11 resource cleanup remain open for M11.
