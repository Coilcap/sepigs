# Outbound And Inbound Reload Implementation Plan

Status: M10 outbound generation prototype and M11 limited outbound runtime
integration implemented. Inbound remains a separately authorized prototype.

## Principles

- Keep `legacy` as the default.
- Expand the experimental allow-list only by separate milestone authorization.
- Preserve existing connections; do not migrate, re-route, or kill them.
- Publish compatible Router/Policy/Outbound state as one snapshot.
- Validate public bind and authentication before opening a candidate listener.
- Keep UDP, fake-IP, plugins, and experimental transports outside early stages.
- Require compatibility and soak gates at every runtime admission.

## M10: Outbound Generation Prototype

Implementation status: complete as a pure-data model, validator, dry-run, and
shadow simulation. It does not publish to Engine.

Scope:

- implement immutable Outbound generation/state types;
- model registry identity, references, draining, and retirement;
- implement tag graph and health carry-over classification;
- add dry-run and shadow adapters only;
- use mock/local candidate resources;
- add fault-injection and degraded-state contract tests.

Prohibited:

- no Engine registry pointer switch;
- no `outbound` runtime allow-list entry;
- no stopping/replacing production outbounds;
- no inbound work;
- no Shadowsocks/Trojan runtime claim;
- no UDP, plugin, WireGuard, QUIC, or pool ownership.

Exit: focused unit/dry-run/shadow tests pass, existing runtime behavior remains
unchanged, and `compat:gate` remains green. M10 completion permits an M11
review only; it does not authorize runtime publication.

## M11: Limited Outbound Runtime Integration

Implementation status: complete for the explicitly enabled experimental TCP
path.

Implemented:

- direct, block, and TCP relay only;
- one composite Router/Policy/Outbound publication;
- connection setup references and old generation drain;
- invalid candidate and partial-commit rollback;
- experimental generation/ref/cleanup/degraded metrics;
- loopback runtime smoke.

Prohibited:

- Shadowsocks, Trojan, WireGuard, plugin outbounds;
- all UDP sends/sessions;
- inbound listener changes;
- connection migration or forced close.

Exit: old long streams survive, new streams use the candidate, removed
outbounds drain safely, final resources are clean, and compatibility remains
at least 44 verified/zero failed. The loopback exit evidence is complete;
extended repeated-reload soak remains a promotion gate.

## M12: HTTP/SOCKS TCP Inbound Prototype

Scope:

- Inbound generation and listener ownership;
- HTTP and SOCKS5 TCP CONNECT only;
- different-address/port candidate-first bind;
- bounded protocol/auth readiness;
- old listener drain and active connection references;
- port-conflict rollback and visible degraded state;
- same-address changes explicitly unsupported or handled by a separately
  approved stable-acceptor strategy.

Prohibited:

- SOCKS5 UDP ASSOCIATE;
- Shadowsocks/Trojan/plugin inbounds;
- public bind without validated auth/security;
- automatic fallback to destructive legacy behavior.

Exit: old tunnels survive, new connections use candidate auth/listener,
rollback leaves old service usable, reconnect load stays within budget, and
resource evidence is clean.

## M13: Shadowsocks/Trojan Admission

Entry requires the external compatibility gate to cover the intended
directions and protocol boundaries.

Scope:

- Shadowsocks outbound/inbound identity and reload cases;
- Trojan outbound/inbound TLS/SNI/trust/password cases;
- wrong-secret, remote-close, large-payload, and long-stream behavior;
- mobile/GUI reconnect testing with evidence format;
- protocol-specific resource and secret-redaction checks.

No unsupported TLS/plaintext boundary may be described as verified.

## M14: UDP And Fake-IP Boundary

Scope is design-first:

- UDP operation/session generation ownership;
- SOCKS5 UDP ASSOCIATE drain semantics;
- Shadowsocks UDP ownership;
- DNS/fake-IP reverse mapping continuity;
- pool/range change classification;
- timeout, orphan-session, malformed packet, and resource pressure tests.

Fake-IP pool migration remains restart-required until bidirectional mapping and
active-session continuity are proven.

## Why Not Inbound In M10

Outbound generation can first be modeled without opening a listener. Inbound
prepare immediately creates externally reachable operating-system resources
and introduces same-address rollback and authentication boundaries. Combining
both in M10 would prevent failures from being attributed and would enlarge the
blast radius.

## Why Not Plugins First

Plugin factories can own workers, child processes, RPC registrations, WASM,
timers, and external side effects. Their rollback contract is strictly harder
than core stateless outbounds. Plugin admission follows owner-scoped,
idempotent lifecycle evidence, not registry convenience.

## Why Not Every Outbound At Once

Direct, block, and TCP relay establish the generation/ref/publication model
without protocol crypto or external server dependencies. Shadowsocks/Trojan
then test whether that model survives real compatibility constraints. UDP,
WireGuard, QUIC, and plugins each require additional ownership models.

## Branch And Release Boundary

M10-M14 work stays on `main` or a dedicated experimental branch. It does not
modify `release/v0.2.x`, move `v0.2.0-beta.0`, or publish a release. A v0.2
maintenance change is created only for an independently backportable bug,
security fix, documentation correction, or compatibility evidence update.

Every stage ends with a reality-check update. A green smoke permits only the
next review; it does not automatically authorize implementation.
