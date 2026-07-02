# Transactional Reload M6 Component Classification

Status: M6 design review. Runtime allow-list remains `metrics` and
`dashboard`.

The tiers describe state ownership and rollback risk, not feature importance.
A tier does not join the runtime transaction until its assigned milestone
passes the test matrix.

| Tier | Component | Current reload behavior | State held | Existing connection effect | Rollback feasibility and cost | Shadow verification | Runtime readiness | Proposed milestone |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Metrics | M5 experimental adapter; legacy remains stop-then-start | HTTP listener, path, renderer | None; scrape requests may finish during close | Supported; low cost for same-address update, medium for listener replacement | Full config and coordinator path | Integrated, experimental | M5 complete; harden through M7+ |
| 0 | Dashboard | M5 experimental adapter; legacy remains stop-then-start | HTTP listener, token, rate buckets, CORS policy | No proxy stream mutation; API requests may finish during close | Supported; low cost in place, medium for listener replacement | Full config and coordinator path, not auth traffic | Integrated, experimental | M5 complete; harden through M7+ |
| 1 | Router | Legacy replaces `Router` after config assignment | Immutable compiled rule order and default target | Existing streams already selected an outbound; only new routing decisions change | Strong rollback by retaining old object; low cost | Candidate compilation and deterministic match corpus | High after generation capture is defined | M7 |
| 1 | Policy graph | Legacy mutates one manager with `reload()` | Policy definitions and outbound membership | Existing streams unaffected; new selections change | Candidate manager swap is feasible; low-to-medium cost | Candidate graph and selection fixtures | Medium-high; state migration contract required | M7 |
| 1 | Prober health state | Policy manager currently retains health by outbound tag during legacy reload | failures, successes, last failure, latency EWMA, round-robin cursor | Existing streams unaffected; new selection ordering changes | Feasible by keyed snapshot/copy; medium cost and semantic risk | Carry-over plan and deterministic clock cases | Medium; needs explicit merge rules | M7 |
| 2 | DNS cache | Legacy creates a new resolver and drops ordinary caches | Positive/negative LRU cache, TTL expiry, in-flight promises | Existing connections usually unaffected; new DNS decisions change | Partial; compatible entries can copy, in-flight work must stay with old resolver | Config diff and cache migration simulation | Medium-low | M8 |
| 2 | Fake-IP store | Legacy reuses only when all relevant fake-IP settings match | address pool, domain/address mappings, TTL, optional persistence | Active connections and reverse lookup can depend on old mappings | Conditional; cheap only for identical pool semantics, otherwise drain/restart | Strong for compatibility classification, weak for active mappings | Low for runtime; shadow/dry-run first | M8 shadow, M10 runtime |
| 2 | Outbound registry | Legacy stops/rebuilds registry after other mutations | outbound objects, pools, transport handles, plugin factories | Active streams retain object references only where implementation already does so | Conditional and potentially expensive; old generation must drain | Candidate config/factory availability can be checked | Low-medium | M9 limited |
| 3 | Inbound listeners | Existing helper stages changed listeners then drains old listeners | TCP/UDP listeners, auth config, accepted socket ownership | Directly controls new accepts; established streams must survive | Conditional; different ports are reversible, same-port restart is costly | Bind plan and mock listener lifecycle | Low | M9 design/prototype only |
| 3 | UDP session manager | Limits are immutable for one manager; reload does not apply them | session map, NAT identity, idle timers, close callbacks | Directly affects active UDP flows | Difficult; requires generation ownership and timer transfer/drain | Session plan and deterministic timer model only | Very low | M10 |
| 3 | Connection manager | Current manager and limiter are constructed once | active TCP records, socket ownership, timeout handles, limiter count | Directly owns all established TCP streams | Replacement is unsafe; reuse with separately reloadable policy is preferable | Limit-diff classification only | Very low | Post-M10 design; no scheduled runtime admission |
| 4 | Plugin manager | Legacy `loadAll()` unloads changed plugins before all later work succeeds | loaded runners, manifests, permissions, registrations | Plugin outbounds can serve active/new requests | Best-effort only unless every plugin declares idempotent lifecycle | Manifest/permission plan is strong; external side effects are not | Not ready | M11 |
| 4 | Remote plugin RPC | Runner close unregisters owned factories | worker/child process, request IDs, in-flight calls, factory ownership | Active plugin requests may fail on runner loss | High cost; needs request drain, owner namespace swap, crash recovery | Protocol/API checks and mock runner faults | Not ready | M11 |
| 4 | WASM/plugin runtime | Legacy manager may replace loaded modules and plugin-owned behavior | module instances, memory, host permissions, callbacks | Depends on host callback and factory use | Unknown for arbitrary modules; restart may be the only safe policy | Module validation possible, side-effect rollback generally impossible | Not ready | M11 or restart-required |

## Classification Rules

- Tier 0 remains the complete M6 runtime allow-list.
- Tier 1 may be admitted only for new connection decisions and only after M7
  authorization.
- Tier 2 requires explicit migration and ownership rules before runtime use.
- Tier 3 requires connection/session generation binding and drain evidence.
- Tier 4 requires a separate threat model and lifecycle transaction.
- Shadow success never upgrades a component's runtime readiness by itself.
