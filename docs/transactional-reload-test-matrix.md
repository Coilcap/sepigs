# Transactional Reload Test Matrix

Status: M6 gate definition for M7-M11. No row is evidence that the component is
currently enabled.

## Required Evidence By Component

| Component | Unit | Contract | Shadow | Runtime smoke | Rollback | Failure injection | Cleanup | Metrics | Compat | Soak |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Router | matcher/compile corpus | immutable generation + publish-once | candidate diff and match comparison | old/new connection route split | invalid candidate keeps old pointer | bad rule/ref, compile timeout | old generation retires after references | prepare/commit/failure | 44 verified, 0 failed | mixed route changes under connection load |
| Policy/prober | selection and health merge | router/policy atomic generation | carry-over plan | new selection uses candidate health | old graph/health unchanged | probe setup failure, late old probe | old timers/probes drain | component durations/rollback | 44 verified, 0 failed | failover/latency load with reload |
| DNS | cache migration and upstream selection | resolver generation ownership | cache classification | controlled old/new upstream answers | old resolver and cache remain usable | UDP/DoH timeout, malformed answer | clients/timers/in-flight maps drain | DNS + reload failures | 44 verified, 0 failed | positive/negative/single-flight pressure |
| Fake-IP | pool/store compatibility | mapping generation ownership | mandatory before runtime | reverse lookup continuity | no mapping loss/remap | corrupt store, range conflict | stores/files/timers release | migration/restart-required count | proxy matrix unchanged | mapping/TTL/pool pressure |
| Outbound registry | factory/config construction | active reference ownership | candidate registry | new stream candidate, old stream old | old registry retained | start/connect/pool cleanup failure | transports/pools drain | generation and cleanup outcome | external protocol gate mandatory | long streams during add/remove |
| Inbound listeners | diff/reuse/auth rules | accept/drain ownership | listener plan | candidate accepts, old stream survives | old accepts after bind/readiness failure | port conflict, handshake probe, drain timeout | ports/sockets/listeners/timers zero | outage/forced drain | real client matrix | reconnect and long-stream soak |
| UDP sessions | generation and timer logic | packet/session owner invariant | session migration plan | old session and new session split | old NAT/session remains | malformed packet, timeout, limit pressure | sockets/timers/sessions zero | packet/session/error deltas | UDP client cases | sustained sessions through reload |
| Plugins/RPC/WASM | manifest/owner/state transitions | owner namespace + idempotent lifecycle | permission/factory plan | load/replace/remove | old runner/factory retained pre-commit | crash, trap, timeout, late RPC | process/worker/factory/listener zero | lifecycle/failure counters | plugin examples and core gate | repeated worker/child/WASM cycles |

Every component must also preserve default legacy behavior and reject use when
its milestone allow-list is not enabled.

## M7 Router And Policy

Required scenarios:

- change route rules under continuous new-connection load;
- reject invalid rule or missing policy/outbound reference before publication;
- carry health failures, successes, latency EWMA, and recovery timestamp only
  for unchanged outbound identity;
- prevent a late old-generation probe from changing candidate health;
- keep one established stream alive and on its original outbound;
- prove the first post-commit connection uses the candidate route;
- rollback router and policy together, never as separate revisions;
- retire old generation after references and timers drain.

Minimum soak: one hour of mixed valid/invalid reloads with continuous
HTTP/SOCKS connections, policy selection, and probes. Error and resource
budgets must be specified before execution.

## M8 DNS And Fake-IP Shadow

Required scenarios:

- change UDP/system/DoH upstream under controlled query load;
- retain only compatible, unexpired positive cache entries;
- cap or invalidate negative cache by candidate policy;
- keep old single-flight promises generation-local;
- roll back on DoH TLS/HTTP failure, UDP timeout, or malformed answer;
- preserve process-level DNS counters;
- classify fake-IP pool/TTL/persistence changes as reuse, drain, or
  restart-required;
- prove fake-IP data never enters real DNS cache.

Minimum soak: one hour of positive, negative, fallback, DoH, UDP, cache
pressure, and repeated candidate failure. Fake-IP remains shadow-only in M8.

## M9 Outbound And Inbound Prototype

Required scenarios:

- add/remove an unused allowed outbound;
- retain an outbound object while an active stream uses it;
- reject candidate routes/policies referencing removed outbounds;
- inject outbound construction, pool, and readiness failure;
- stage a different-port inbound and probe protocol readiness;
- inject port conflict and prove old listener still accepts;
- change auth and verify old/new credential boundary;
- preserve established inbound connections during drain;
- measure same-port reconnect outage and rollback behavior.

Minimum soak: long-lived and short-lived TCP traffic through repeated
successful/failed registry changes. Inbound remains prototype-only until real
client reconnect evidence exists.

## M10 UDP And Fake-IP Runtime

Required scenarios:

- retain every bidirectional fake-IP mapping across compatible reload;
- reject or require restart for incompatible pool range/size changes;
- apply TTL policy without resurrecting expired mappings;
- keep active UDP sessions on their original generation;
- route new UDP sessions through the candidate generation;
- preserve DNS-over-UDP query ownership;
- survive fake-IP UDP reverse lookup during reload;
- enforce amplification, session, socket, and timer limits while two
  generations drain;
- finish with mappings consistent and sessions/sockets/timers at zero.

Minimum soak: six-hour resumable mixed UDP/DNS/fake-IP run before beta-ready
consideration.

## M11 Plugins

Required scenarios:

- load, publish, replace, and unload owner-scoped factories;
- keep in-flight requests on the old runner during bounded drain;
- contain remote plugin crash before and after commit;
- time out RPC once without replaying side effects;
- reject API or permission mismatch before publication;
- roll back permission changes and registrations;
- contain WASM trap and release instance memory;
- prove no worker, child process, IPC listener, timer, factory, or callback
  remains after stop.

Minimum soak: repeated in-process, worker, and child lifecycle cycles with
fault injection. Irreversible plugins remain restart-required.

## Universal Promotion Gate

Before any allow-list expansion:

- lint, typecheck, full tests, build, docs, and security pass;
- dry-run and shadow remain side-effect free;
- runtime smoke is loopback-only and teardown is zero;
- compatibility baseline is not lowered to hide a regression;
- failure reports separate product failure from environment block;
- no secret, local path, checkpoint, binary, or profile enters release
  artifacts;
- the reality check labels the component experimental until its soak and
  client/compat evidence pass.
