# Transactional Reload Test Matrix

Status: M8.5 DNS runtime evidence is implemented. M9 Outbound/Inbound design
evidence is complete; M10-M14 runtime rows remain future work.

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
budgets must be specified before execution. This soak is not part of the M7
runtime smoke claim and has not been recorded as completed.

## M8 DNS Design And M8.5 Runtime Gate

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

M8 produced design/audit evidence. M8.5 runtime tests prove:

- active generation changes only after candidate health succeeds;
- old in-flight queries complete and populate only old cache;
- candidate rollback preserves old positive/negative cache;
- system resolver late results cannot cross generation;
- DoH bodies/logs are bounded and endpoint secrets are redacted;
- UDP response source, ID, question, and answer bounds are validated;
- every fake-IP config change rejects before DNS prepare;
- repeated successful/failed generations retire without cache, socket, timer,
  listener, or single-flight residue.

The local runtime smoke covers old/new UDP answers, an established CONNECT,
fake-IP rejection, and final resource counts. The long-duration mixed DNS
reload soak below remains pending and blocks promotion beyond experimental.

Minimum M8.5 soak: one hour of positive, negative, fallback, DoH, UDP/system,
cache pressure, old/new query overlap, and repeated candidate failure.
Fake-IP remains runtime-excluded until M10.

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

## M11 Limited Outbound Runtime

Implemented cases:

- direct, block, and TCP relay candidate construction and publication;
- combined Router/Policy/Outbound atomic publication;
- Shadowsocks, Trojan, and experimental WireGuard rejection;
- missing policy target rejection with the old generation retained;
- active removed-tag warning;
- old reference stability and new active-generation lookup;
- manual rollback restoration and candidate cleanup;
- legacy-path regression;
- Prometheus prepare/commit/rollback, generation, draining, and rejection
  metrics with secret-redaction assertions;
- real loopback old/new tunnel split with no reload-driven close, no listener
  or DNS change, and final resources at `0/0/0`.

Pending promotion evidence: repeated successful/failed reload soak with
long-lived TCP streams. UDP and protocol-specific outbounds are outside M11.

## M14 UDP And Fake-IP Runtime

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

## Future Plugin Runtime

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
