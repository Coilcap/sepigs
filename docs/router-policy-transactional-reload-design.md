# Router And Policy Transactional Reload Design

Status: M7 experimental runtime integration implemented. It remains
default-off and affects new connection decisions only.

## Scope And Invariants

M7 may change routing decisions for new requests only. It must not:

- migrate or close established TCP/UDP connections;
- create, remove, or replace inbound or outbound objects;
- change DNS, fake-IP, plugin, Metrics, or Dashboard ownership;
- mutate the currently active router/policy object during prepare;
- publish a router that references a missing outbound or policy.

The router and policy graph form one generation. Publishing only one of them
would permit a route to select a policy graph from another revision.

## Router Candidate

Prepare builds a new immutable `Router` from the fully expanded candidate:

1. load and validate all rule-set files;
2. validate default, rule, policy, GeoIP, and GeoSite references;
3. compile every matcher with bounded rule and input sizes;
4. run a deterministic match corpus covering exact domain, suffix, CIDR,
   ports, geo expansion, priority, and default behavior;
5. record the candidate generation without changing the active pointer.

The current router has no route-result cache. M7 must not introduce one merely
for reload. If a cache is later added, it must be generation-keyed or discarded
at publication; cached results may never cross generation IDs.

Fake-IP reverse lookup occurs before `Router.match()` in Engine. M7 keeps that
boundary unchanged: the active DNS/fake-IP generation restores the domain,
then the connection captures one router/policy generation. Router reload does
not migrate fake-IP mappings.

## Generation Lifetime

Each new connection captures the active router/policy generation once before
route selection. The selected outbound and policy candidates belong to that
decision. Existing connections do not re-route after publication.

The old generation remains readable until:

- no in-progress connection setup references it; and
- its bounded grace/reference period completes.

M7 should use explicit reference ownership or an immutable snapshot retained
through request setup. Garbage collection alone is not sufficient evidence of
safe retirement.

## Policy Candidate

Prepare builds a complete candidate policy graph and validates:

- unique policy tags and no collision with outbound tags;
- non-empty members where required;
- every member references an existing, unchanged outbound;
- strategy-specific limits and recovery thresholds;
- no cycle or indirect reference if nested policies are introduced later.

### Health Carry-Over

Health state is keyed by unchanged outbound tag:

- failures, successes, `lastFailureAt`, and latency EWMA carry over only when
  the outbound identity and probe semantics are unchanged;
- a newly added outbound starts cold with no latency and healthy default;
- a removed outbound's state stays only with the old generation;
- changed server/transport identity resets latency and failure history;
- stale timestamps remain subject to candidate recovery thresholds;
- an unhealthy outbound remains unhealthy unless the candidate threshold
  legitimately makes the same recorded state healthy.

Round-robin cursors may carry over only when the policy tag, strategy, and
ordered member list are identical. Otherwise they reset to zero. Failover
ordering comes from candidate config, while health values follow outbound
identity.

M7 does not schedule, stop, or mutate active probes. Prepare copies the
current health values by value into the candidate policy generation. Later
updates to either policy manager cannot mutate the other snapshot. Active
prober lifecycle integration remains outside M7.

## Commit And Rollback

Commit publishes one immutable object containing router, policy graph, and
candidate health snapshot. New connection setup reads that pointer once.

Before publication, any failure releases candidate-only timers and state and
leaves the old pointer active. After publication, an old-generation cleanup
failure is observable but does not republish a partially retired generation.

Rollback tests must prove:

- invalid rules never publish;
- policy/route reference failure never publishes;
- candidate probe setup failure retains old selection behavior;
- old health and round-robin state remain unchanged after failure;
- no established connection closes or changes destination.

## M7 Smoke And Soak

Runtime smoke should hold one established stream, publish a route change, and
show that a new connection follows the candidate while the old stream remains
usable. A forced candidate failure must keep both old and new connection
attempts on the old route.

The checked-in M7 smoke holds a real HTTP CONNECT stream across publication,
then proves that a new connection follows the candidate block route:

```bash
npm run reload:runtime-smoke:m7 -- \
  --config examples/sepigs.transactional-router-policy.experimental.json
```

Evidence is written to `reports/reload/runtime-smoke-m7-latest.json` and
`.md`. The broader M7 soak should run repeated valid/invalid route and policy candidates under
continuous HTTP and SOCKS connection creation, active probes, and failover.
It must report zero killed established streams, zero mixed-generation
decisions, bounded generation retention, and final resources at zero.
