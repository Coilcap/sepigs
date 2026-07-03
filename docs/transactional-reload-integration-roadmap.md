# Transactional Reload Integration Roadmap

Status: M7 Router/Policy runtime integration is implemented behind the
explicit experimental allow-list. M8 DNS design is complete; M8.5 and M9-M11
remain unimplemented plans.

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

Entry requires separate authorization after M8 review. Proposed allow-list
addition is `dns` only; fake-IP remains excluded.

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

Any fake-IP difference rejects the DNS transaction and remains M10 work.

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

M7 authorizes only Router, Policy, and read-only health carry-over. M8 is
design evidence only. The next allow-list change requires explicit M8.5
authorization and must not be inferred from a green M7 smoke or M8 document.
