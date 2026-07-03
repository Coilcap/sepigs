# Inbound And Outbound Transactional Reload Design

Status: M9 design only. Inbound and outbound remain outside the current
runtime allow-list.

## Outbound Registry

The registry must become generation-owned. Prepare builds a complete candidate
map and validates:

- unique tags, protocol/factory availability, and referenced credentials;
- policy membership and route targets against the same candidate graph;
- transport and connection-pool capability;
- plugin ownership without loading or mutating production plugin factories;
- readiness with bounded, non-retrying probes where safe.

An established connection remains bound to the outbound object that created
it. Removing or changing an outbound prevents new selection after commit but
does not destroy the old object until its active stream/reference count
reaches zero or an explicit drain deadline expires.

Future M11 runtime scope should initially permit only direct, block, and TCP
relay outbounds with no plugin or external process ownership. Shadowsocks/Trojan
admission requires renewed external compatibility evidence for reload
boundaries.

Policy groups and router references must publish atomically with the registry.
A candidate cannot remove an outbound still referenced by candidate routes or
policies.

Rollback before publication closes candidate pools/transports and preserves
the old registry. After publication, cleanup failure keeps the new registry
active and alerts; it must not republish an old registry whose retirement has
started.

## Inbound Drain-And-Rebind

Inbound reload owns listener acceptance, authentication, and connection
handoff. It is high risk and does not enter M7.

Prepare behavior:

1. reuse exactly unchanged listeners;
2. create changed listener objects without touching current listeners;
3. bind different addresses/ports;
4. run a protocol-level readiness probe;
5. reject the candidate and close staged listeners on any bind/probe failure.

At commit, candidate listeners become the source of new accepts before old
listeners stop accepting where the operating system permits both bindings.
Old listeners then drain established connections through the existing
connection manager.

Same-address/port replacement cannot rely on two ordinary Node servers binding
simultaneously. It requires one reviewed strategy:

- shared acceptor with generation-specific protocol/auth handler;
- operating-system socket handoff with platform evidence; or
- bounded stop/start plus tested restart of the old listener on failure.

It must never be described as zero-downtime without measured evidence.

## Authentication Changes

Auth changes affect new handshakes only. Existing tunnels are not
reauthenticated or killed. Candidate readiness verifies:

- unauthenticated requests fail when auth is enabled;
- valid candidate credentials succeed;
- old credentials stop working only after commit;
- credentials never appear in events, logs, reports, or metric labels.

## Rollback And Cleanup

Port conflict leaves old listeners accepting. A readiness failure closes every
staged socket. Commit failure before old drain restores old acceptance. Once
old listener drain begins, rollback is best-effort unless a shared acceptor
keeps the old handler available.

Every listener and accepted socket has one generation owner. Cleanup must
remove error/close/timeout listeners, cancel drain timers, and release bound
ports. Forced drain closure is counted and logged separately from graceful
completion.

## Client Reconnect Behavior

Chrome/system proxy, Mihomo, Shadowrocket, and other clients may retry during
an unavoidable same-port gap. Tests must record:

- refused/retried connection count and maximum outage;
- credential transition behavior;
- DNS behavior where the client uses SOCKS remote resolution;
- long-lived stream survival;
- reconnect success without duplicate or leaked sessions.

Inbound remains design-only in M9. M12 may begin a separately authorized
HTTP/SOCKS TCP prototype after the generation/contract gates pass.
