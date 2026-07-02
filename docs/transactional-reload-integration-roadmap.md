# Transactional Reload Integration Roadmap

Status: M6 planning only. No M7-M11 component is enabled by this document.

## M7: Router And Policy Decisions

Allow-list proposal:

- router;
- policy graph;
- read-only prober health snapshot/carry-over.

Prohibited:

- DNS, fake-IP, outbound object replacement, inbound listeners, UDP sessions,
  connection manager, plugins, WASM, and plugin RPC.

Rollback must retain one old immutable router/policy generation and restore it
with one pointer publication. Existing connections must not be migrated or
closed. Smoke must prove a new connection uses a candidate route while an
established stream remains alive. Soak must run mixed route changes and
injected invalid candidates under continuous HTTP/SOCKS traffic. The
compatibility gate must remain at least 44 verified and zero failed.

No `v0.2.0-beta.1` or beta.2 branch is needed for M7 feature work. A v0.2
maintenance release is created only if testing discovers an independently
backportable bug or security issue.

## M8: DNS State And Fake-IP Classification

Allow-list proposal:

- DNS resolver/upstream generation;
- compatible positive and negative cache migration;
- fake-IP compatibility dry-run and shadow classification only.

Prohibited:

- fake-IP pool/store runtime replacement;
- outbound/inbound, UDP, connection manager, plugins, WASM, and RPC.

Rollback must leave old resolver in-flight work and caches readable until
references drain. DoH/UDP upstream failure must not publish the candidate.
Smoke must resolve through old and candidate upstreams with controlled
answers. Soak must cover cache hits, misses, negative TTL, single-flight, DoH
failure, and memory bounds. Compatibility remains 44 verified/zero failed.

No v0.2 beta branch is needed unless an M8 test reveals a v0.2 DNS defect that
meets the maintenance policy.

## M9: Limited Outbound Work, Inbound Prototype

Allow-list proposal:

- outbound registry changes restricted to direct/block/tcp-relay instances
  with generation-owned drain behavior;
- inbound drain-and-rebind remains design/prototype and is not runtime
  admitted by default.

Prohibited:

- plugin-provided outbounds, active connection migration, same-address inbound
  replacement without rollback proof, UDP/fake-IP runtime migration, plugins.

Rollback must preserve removed outbound objects until their active reference
count reaches zero. Inbound prototypes must keep old listeners accepting if
candidate bind/readiness fails. Smoke must include removed-unused outbound,
active stream retention, port conflict, and auth change. Soak must maintain
long-lived TCP streams during repeated candidate success/failure. External
protocol compatibility remains a mandatory gate.

No v0.2 beta branch is planned for feature work. A maintenance branch receives
only independently justified fixes.

## M10: Fake-IP And UDP Strategy

Allow-list proposal, only after separate authorization:

- compatible fake-IP store generation;
- UDP session manager generation binding and drain.

Prohibited:

- silent pool remap, active session transfer without identity proof, plugin
  reload, and privileged transport work.

Rollback must preserve every active reverse mapping and UDP session owner.
Pool range changes default to restart-required or staged drain. Smoke must
prove reverse lookup and UDP reply continuity. Soak must include TTL expiry,
pool pressure, DNS-over-UDP, fake-IP UDP routing, malformed datagrams, and
final timer/socket/session zero. Compatibility must remain non-regressed.

No automatic v0.2 beta.2 is created. A v0.2 hotfix follows the established
maintenance triggers only.

## M11: Plugin Lifecycle Transaction

Allow-list proposal:

- owner-scoped plugin manager generation;
- remote factory namespace swap;
- bounded worker/child RPC drain;
- WASM only when the module declares a supported reversible lifecycle.

Prohibited:

- arbitrary in-process external side effects;
- permission expansion without revalidation;
- socket-handle transfer;
- claiming rollback for modules that cannot unload safely.

Rollback must unregister candidate-owned factories, retain old runners until
in-flight RPC settles or times out, and contain candidate crashes. Smoke must
cover load, replacement, removal, permission rejection, crash, and timeout.
Soak must repeat worker/child/WASM cycles with zero process, worker, listener,
timer, and factory residue. Security and compatibility gates are mandatory.

M11 feature work remains on main or an isolated experimental branch. It does
not create a v0.2 beta branch.

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

M6 authorizes planning only. The next allow-list change requires explicit M7
authorization and must not be inferred from a green shadow report.
