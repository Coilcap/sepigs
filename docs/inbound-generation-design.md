# Inbound Generation Design

Status: M9 design only. No inbound transactional runtime adapter is
implemented.

## Model

A future immutable `InboundGeneration` contains:

```text
id
configHash
createdAt
listenerSet
authSnapshot
bindSnapshot
readinessState
drainingState
rollbackPlan
```

Each listener entry records tag, protocol, normalized bind identity, redacted
auth/security identity, candidate/accepting/draining state, active connection
references, and owned resources. Private keys, passwords, and usernames are
fingerprinted with an in-memory key and never persisted.

## Prepare

Prepare:

1. validates public-bind and authentication policy before opening a socket;
2. validates unique tags and bind identities;
3. classifies unchanged, add, remove, different-address replace, same-address
   replace, and restart-required entries;
4. constructs candidate protocol handlers and reads required local material;
5. binds candidate listeners where candidate-first replacement is possible;
6. records every listener/socket/timer for teardown;
7. leaves the active generation accepting traffic.

A prepared listener must not be published in the active listener registry.
Because a bound Node server normally starts accepting immediately, the future
adapter needs an accept gate that rejects/queues no user traffic until commit,
or a stable acceptor whose handler pointer is switched atomically.

Simply calling current `start()` during prepare does not meet this requirement.

## Readiness

Readiness is bounded and protocol-specific:

- HTTP: local CONNECT/absolute-form parse plus auth success/failure;
- SOCKS5: method negotiation, auth success/failure, and CONNECT handshake;
- Shadowsocks: external-compatible cipher/password handshake when admitted;
- Trojan: TLS/certificate/SNI and password handshake when admitted.

The probe uses loopback, a mock-safe destination, no public request, a hard
deadline, and isolated evidence. Listener availability alone is not sufficient.

## Commit And Traffic Boundary

Commit publishes the candidate listener set. New accepts use candidate protocol
and auth snapshots. Old listeners stop accepting new connections and become
draining.

Connections accepted before commit retain:

- old protocol handler and auth result;
- old timeout/config snapshot;
- existing client/remote sockets;
- old inbound generation attribution.

They are not migrated or actively closed. An auth change affects only
connections whose handshake begins after the publication boundary.

## Drain

Draining closes the listening handle without destroying accepted sockets. Each
accepted TCP connection holds an inbound generation reference until its
`ManagedConnection` reaches closed.

A drain policy defines:

- soft drain deadline and warning threshold;
- maximum generations retained;
- operator-visible long-lived connection list;
- shutdown-only force close behavior;
- no automatic user-connection kill in the first runtime milestone.

SOCKS5 UDP ASSOCIATE is excluded because it also owns a UDP socket and global
session entry. It cannot be represented by TCP listener references alone.

## Same-Address Replacement

Same host/port replacement is a special capability, not an ordinary candidate
bind. The implementation must select one reviewed strategy:

1. stable acceptor with generation-switched handlers;
2. proven platform reuse/dispatch behavior;
3. bounded stop/rebind with explicit outage and rollback plan;
4. restart-required.

Until one strategy is implemented and tested, auth-only, TLS-only,
protocol-only, or config-only changes on an unchanged address are classified
unsupported for transactional runtime. They must not silently fall back to
legacy.

## Rollback

Before publication, rollback stops and releases candidate listeners while the
old generation remains accepting.

After publication:

- restore the old generation as active if its acceptors remain resumable;
- stop candidate accepts;
- keep already accepted candidate connections alive;
- record both generations as draining where necessary;
- never claim rollback success if the old address cannot be rebound.

An inability to restore service sets a visible degraded state, rejects another
reload, preserves diagnostics, and recommends restart. Degraded state is never
hidden behind a successful config update.

## Security Boundary

Public bind validation precedes socket creation. Loopback-to-public changes are
high risk and require valid protocol authentication, explicit configuration,
redacted logs, and security tests.

Trojan candidate preparation may read certificate/key files into candidate
TLS state, but cleanup must release references and errors must not expose file
contents. Shadowsocks/Trojan secret identity changes are never carried into old
handlers.

## Protocol Admission

M12 prototype scope:

- HTTP TCP;
- SOCKS5 TCP CONNECT;
- different-address/port candidate-first replacement.

Deferred:

- SOCKS5 UDP ASSOCIATE and all UDP ownership;
- Shadowsocks inbound;
- Trojan inbound/TLS;
- plugin inbounds;
- same-address replacement unless its strategy is separately accepted.

## Required Observability

- active inbound generation sequence;
- listener state by bounded tag/protocol;
- readiness result and duration;
- accepting/draining listener counts;
- active connections by generation;
- drain age and timeout warnings;
- rollback and rollback-failure counts;
- degraded-state gauge;
- resource cleanup result.

## M9 Boundary

M9 is design-only. It binds no listener, changes no auth policy, drains no
connection, and does not add `inbound` to the runtime allow-list.
