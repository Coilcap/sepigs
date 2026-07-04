# Transactional Reload Integration Roadmap

Status: M8.5 DNS runtime integration, M9 design, M10 Outbound generation
prototype, and M11 limited Outbound runtime integration are complete behind
the explicit experimental allow-list. M12-M14 remain separately authorized
future work.

## M7: Router And Policy Decisions

Implemented allow-list:

- router;
- policy graph;
- read-only prober health snapshot/carry-over.

Prohibited:

- DNS, fake-IP, outbound object replacement, inbound listeners, UDP sessions,
  connection manager, plugins, WASM, and plugin RPC.

Rollback retains one old immutable router/policy generation and restores it
with one pointer publication. Existing connections must not be migrated or
closed. The M7 smoke proves a new connection uses a candidate route while an
established stream remains alive. A future soak must run mixed route changes and
injected invalid candidates under continuous HTTP/SOCKS traffic. The
compatibility gate must remain at least 44 verified and zero failed.

No `v0.2.0-beta.1` or beta.2 branch is needed for M7 feature work. A v0.2
maintenance release is created only if testing discovers an independently
backportable bug or security issue.

## M8: DNS State Design And Fake-IP Classification

M8 is design-only and does not change the allow-list. It defines:

- DNS resolver/upstream generation;
- conditional positive cache carry-over and conservative negative-cache rules;
- generation-local single-flight and in-flight draining;
- DoH/UDP resource and health-check boundaries;
- fake-IP compatibility dry-run and shadow classification only.

Prohibited:

- fake-IP pool/store runtime replacement;
- outbound/inbound, UDP, connection manager, plugins, WASM, and RPC.

Rollback must leave old resolver in-flight work and caches readable until
references drain. DoH/UDP upstream failure must not publish the candidate.
M8 documents these requirements but performs no runtime publication.

No v0.2 beta branch is needed unless an M8 test reveals a v0.2 DNS defect that
meets the maintenance policy.

## M8.5: DNS Generation And Adapter

M8.5 was separately authorized and adds `dns` only; fake-IP remains excluded.

Implementation gates:

- immutable generation plus active/draining ownership;
- isolated bounded caches and conditional carry-over;
- no cross-generation single-flight join or cache write;
- structural/local-only health checks by default;
- atomic publication and rollback with old queries completing normally;
- dry-run, shadow, loopback runtime smoke, fault injection, metrics, and
  cache/in-flight/resource tests;
- one-hour DNS reload soak covering positive/negative cache, DoH/UDP/system,
  timeout, fallback, repeated candidate failure, and memory bounds;
- compatibility remains at least 44 verified and zero failed.

Any fake-IP difference rejects the DNS transaction and remains M14 work.

Implemented evidence includes generation/store ownership, conditional
positive-cache carry-over, generation-scoped single-flight, structural
DoH/UDP validation, rollback, experimental metrics, and a local-only runtime
smoke. The one-hour mixed DNS reload soak remains a promotion gate and is not
claimed by M8.5.

## M9: Outbound/Inbound Design Review

M9 audits the current mutable outbound registry, legacy listener reload,
connection binding, policy/health dependencies, protocol identities, public
bind rules, and rollback limits. It defines separate Outbound and Inbound
generation models, contract extensions, risk matrix, future tests, and staged
implementation.

M9 changes no runtime code or allow-list. Existing connections are never
migrated, re-routed, or killed. UDP, fake-IP, plugins, connection-manager, and
experimental transports remain excluded.

## M10: Outbound Generation Prototype

M10 implements immutable registry descriptors, identity/risk classification,
reference simulation, validation, dry-run, and shadow evidence. It stores no
live outbound objects, invokes no factory/network path, does not switch the
Engine registry, and does not add `outbound` to the runtime allow-list.

## M11: Limited Outbound Runtime

Implemented under explicit `transactional-experimental` opt-in for direct,
block, and TCP relay only. Router/Policy/Outbound publish as one compatible
snapshot when changed together. Existing TCP streams retain the old outbound
generation until socket close; new setup uses the active generation.
Shadowsocks, Trojan, UDP, plugins, WireGuard, and active connection migration
remain excluded. Runtime smoke, fault injection, compatibility, and security
gates pass; extended soak remains a promotion gate.

## M12: HTTP/SOCKS TCP Inbound Prototype

M12 may prototype different-address/port candidate-first listeners for HTTP
and SOCKS5 TCP. It requires protocol/auth readiness, old listener drain,
active-connection references, port-conflict rollback, and visible degraded
state. Same-address changes remain unsupported/restart-required until a
reviewed strategy exists.

## M13: Shadowsocks/Trojan Admission

Protocol-specific outbound/inbound reload may be considered only after external
compatibility covers cipher, password, TLS/SNI/trust, large payload, remote
close, and long-stream behavior. Mobile reconnect evidence is required.

## M14: UDP And Fake-IP Strategy

M14 designs UDP operation/session generation ownership, SOCKS5 UDP ASSOCIATE,
Shadowsocks UDP, and DNS/fake-IP reverse mapping continuity. No mapping or
active session is silently migrated.

## Stage Gates

Every stage requires:

1. design and threat/risk review;
2. explicit config and runtime allow-list authorization;
3. unit, contract, shadow, rollback, failure injection, and resource tests;
4. a loopback-only runtime smoke;
5. a resumable soak appropriate to state lifetime;
6. lint, typecheck, full test, docs, security, compatibility, and package
   checks;
7. updated reality check and no production-stable claim.

The current allow-list is
`metrics/dashboard/router/policy/dns/outbound`. The outbound adapter admits
only direct, block, and TCP relay. Any further allow-list change requires
separate authorization and must not be inferred from green M8.5 evidence.
