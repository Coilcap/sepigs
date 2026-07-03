# Inbound Reload Current-State Audit

Status: M9 design review. Inbound runtime transactions remain disabled.

## Runtime Shape

`Engine` owns one mutable inbound map. Each inbound owns its Node TCP server and
a set of accepted client sockets. Accepted connections are registered in the
global `ConnectionManager`, which owns timeout, byte, socket, and close state.

HTTP, SOCKS5, Shadowsocks, and Trojan all implement `start()`, `stop()`,
`drain()`, and `address()`. The shared interface does not expose readiness,
accept-state, active-connection references, drain deadlines, rollback state, or
resource descriptors.

## Existing Drain-And-Rebind

Legacy `reloadInbounds()` already stages changed listeners before draining old
listeners:

1. unchanged tag/config pairs reuse the existing object;
2. every changed/new inbound is constructed and started;
3. if any start fails, all staged listeners are stopped and the old map is
   returned;
4. after all starts succeed, changed/deleted old listeners call `drain()` or
   `stop()`;
5. Engine replaces lifecycle registrations and the inbound map.

Tests prove a different-port HTTP candidate starts before old drain, an
established tunnel survives, and a port conflict keeps the old listener.

This is useful evidence, but it is not a `ReloadableComponent`, does not
participate in cross-component rollback, and has no degraded-state reporting.

## Listener Lifecycle

HTTP and SOCKS5 `drain()` call `server.close()` without waiting for accepted
sockets to close. Existing sockets stay alive and continue through their
captured inbound object/config. Full `stop()` closes every accepted socket.

Shadowsocks and Trojan follow the same broad model, but their compact
implementations do less structured close-error reporting. Their drain calls do
not expose completion or timeout evidence.

The old inbound object remains reachable through accepted socket callbacks
until those sockets close, but there is no explicit generation/ref counter.

## Same-Address Changes

Candidate-first replacement cannot bind the exact same host/port while the old
Node server owns it. Therefore an auth-only, protocol-only, certificate-only,
or timeout-only change on the same address currently fails candidate start and
keeps the old listener.

A future design must choose and test one of:

- stable acceptor with atomically replaced handshake/auth handler;
- operating-system-supported reuse with strict dispatch guarantees;
- bounded stop-old/start-new plus explicit rollback/outage budget;
- restart-required classification.

M9 does not choose an unsafe implicit fallback.

## Protocol Boundaries

### HTTP

Basic Auth is evaluated per new request/connection using the inbound object's
immutable config. Existing tunnels are unaffected by later auth changes.
Forward and CONNECT streams are held by `ManagedConnection`.

### SOCKS5

Username/password negotiation is evaluated during handshake. TCP CONNECT has
the same drain behavior as HTTP.

`UDP ASSOCIATE` creates a separate UDP socket and a global
`UdpSessionManager` entry tied to the TCP control connection. Draining the TCP
listener does not transfer or generation-bind that UDP resource. UDP ASSOCIATE
is therefore excluded from future M12 inbound runtime work and deferred to the
M14 UDP strategy.

### Shadowsocks

The crypto context is derived at construction. A method/password change is a
security identity change. Existing encrypted streams must keep the old
context; readiness needs a real local handshake, not only a listening socket.

### Trojan

TLS certificate/key files are read during start, so missing or invalid files
fail candidate prepare/start without touching the old listener. A listening
TLS server is not sufficient readiness evidence: certificate, TLS handshake,
password, SNI/client behavior, and external compatibility boundaries matter.

## Authentication And Public Bind Guard

Config parsing rejects public HTTP/SOCKS binds without enabled auth and rejects
public Metrics/Dashboard exposure. Shadowsocks and Trojan use protocol
credentials, but their public exposure still carries brute-force, traffic,
certificate, and abuse risks.

The guard must run before candidate construction. A change from loopback to
`0.0.0.0`, `::`, or `[::]` is high risk and must never become reachable before
auth/security validation succeeds. Candidate logs and reports must redact all
passwords, tokens, certificate key material, and user identities.

## Readiness And Rollback

Current readiness means `listen` emitted successfully. It does not prove:

- HTTP/SOCKS auth success and rejection behavior;
- protocol handshake correctness;
- Trojan TLS certificate/SNI behavior;
- Shadowsocks cipher/password behavior;
- candidate routing/outbound reachability;
- old/new generation attribution.

Before old drain, future readiness must perform a bounded loopback protocol
probe where supported. A candidate bind failure currently rolls back cleanly
by stopping staged listeners. After old drain starts, rollback is weaker:
there is no formal ability to resume the same old `net.Server`, and rebinding
can fail. That failure must enter a visible degraded state.

## Metrics And Resource Risks

Current stats are process-wide connections, bytes, failures, and UDP sessions.
There is no inbound generation ID, accepting/draining gauge, readiness result,
drain age, forced drain, or rollback-failure metric.

Risks include:

- staged listener/socket leaks after partial prepare;
- old listener callback errors hidden during drain;
- unbounded old generations held by long-lived clients;
- mobile reconnect storms during an address/outage transition;
- orphan SOCKS5 UDP sessions;
- TLS/crypto objects retaining secrets;
- same-address rollback failure;
- lifecycle registrations diverging from the active map.

## M9 Conclusion

HTTP and SOCKS5 TCP are reasonable future prototype candidates after a formal
listener generation and same-address policy exist. Shadowsocks, Trojan, plugin
inbounds, and SOCKS5 UDP ASSOCIATE remain outside the first runtime milestone.
M9 changes no listener or allow-list behavior.
