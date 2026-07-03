# Outbound Reload Current-State Audit

Status: M9 design review. No outbound runtime transaction is enabled.

## Runtime Shape

`Engine` owns one mutable `Map<string, Outbound>`. Core and plugin factories
are held in a separate process-global registry. `openTcp()` acquires the active
Router/Policy generation, selects a tag, and then looks that tag up in the
mutable Engine map.

This is the main consistency gap: Router/Policy and outbound objects are not
captured in one snapshot. A registry replacement can therefore race a
connection setup that already captured an older routing generation.

The `Outbound` interface provides `connect()`, optional `sendUdp()`, and
`stop()`. It has no connection-reference counter, generation owner, readiness
probe, drain state, or structured resource inventory.

## Core Outbounds

| Type | Persistent state | Replacement behavior | Dependencies and risks |
| --- | --- | --- | --- |
| `direct` | Config, limits, logger, stable DNS resolver reference | New TCP/UDP operations use whichever object is found; established TCP keeps its socket | Depends on DNS. The M8.5 resolver object switches internal generations, but an outbound generation must still bind the intended DNS generation at setup time. |
| `block` | Immutable reason string | Stateless rejection; safest first runtime candidate | Error text contains destination and must stay out of unbounded metrics labels. |
| `tcpRelay` | Immutable relay target and timeout | Established socket remains connected to its original target | A target change affects only new sockets if generation binding is correct. |
| `shadowsocks` | Immutable server config and derived crypto context | Established encrypted stream owns its crypto/socket; each UDP send creates a one-shot socket | Cipher/password/server changes are security identities, not reusable state. UDP sockets are not generation-tracked. |
| `trojan` | Immutable server/TLS/password config | Established TCP/TLS socket remains usable after object replacement | TLS trust, SNI, password, and plaintext-test boundaries require external compatibility evidence. |

WireGuard and plugin outbounds exist in the registry surface but are outside
M9. WireGuard remains experimental and plugin factories have separate
ownership/lifecycle risks.

## Active Connection Binding

`ManagedConnection` owns client and remote streams after `connect()` returns.
It does not retain the selected outbound object or outbound generation.
`TcpOutboundConnection` returns an `outboundTag`, but the connection snapshot
does not persist that tag.

Consequences:

- replacing or deleting a stateless outbound object normally does not close an
  already-established TCP stream;
- an in-progress `connect()` still needs the old object to remain reachable
  until its promise settles;
- future pooled or multiplexed outbounds would need references for the entire
  stream lifetime;
- UDP sends and SOCKS5 UDP sessions cannot use this TCP-only assumption;
- connection evidence cannot currently prove which generation created a
  stream.

M9 does not change this behavior.

## Legacy Reload

Legacy reload constructs a new Router/Policy pair, replaces config and DNS,
then calls `reloadOutbounds()`. That method:

1. calls `stop()` on every old outbound;
2. unregisters all old objects from lifecycle;
3. clears the map;
4. creates every configured outbound and inserts it incrementally.

There is no candidate registry, readiness phase, atomic pointer, reference
drain, or rollback. If construction fails after the clear, the old registry is
not restored. Most current `stop()` methods are no-ops, which masks rather than
solves the future resource-ownership problem.

## Registry And Validation

Config parsing enforces unique outbound tags and validates route, rule-set,
and policy references. Runtime factory lookup rejects an unknown type. Factory
ownership prevents one plugin owner from replacing another owner's type.

These checks do not create a registry transaction. A tag rename is currently
just a changed config; future generation logic must classify it as remove old
plus add new and reject any stale route/policy reference before prepare
completes.

## Policy, Failover, And Probing

Router/Policy generations own policy definitions and mutable health snapshots.
M7 carries health by outbound tag and validates candidate references against a
tag set supplied by the current config. Round-robin cursor state is not carried.

`ActiveProber` has bounded concurrency, timeout, and backoff, but it is not
wired into Engine lifecycle or outbound ownership. A future outbound
transaction must not silently claim that probe timers or targets are already
generation-safe.

Health carry-over is safe only when tag and outbound security/endpoint identity
are unchanged. A tag reused for a different server, cipher, TLS policy, or
relay target must start cold.

## Metrics

Current metrics expose aggregate route matches and outbound failures, plus
Router/Policy generation IDs and policy health through Dashboard data. They do
not expose:

- active connection count by outbound generation;
- registry generation ID;
- draining outbound objects;
- per-generation connect failures;
- outbound cleanup/forced-retire counts.

New metrics must use bounded tag/type labels and must never expose passwords,
keys, SNI secrets, full destinations, or plugin options.

## Rollback And Resource Risks

Current transactional adapters for outbound and inbound are prototype-only and
do not touch Engine state. The experimental runtime allow-list excludes both.

Key risks before implementation:

- old objects can disappear while `connect()` is pending;
- routing and registry can expose mixed generations;
- partial candidate construction can leak sockets, pools, timers, or crypto
  state introduced by future implementations;
- `stop()` has no distinction between stop-accepting, drain, and force-close;
- Shadowsocks UDP sockets are outside generation accounting;
- Trojan TLS readiness cannot be inferred from constructor success;
- plugin-provided outbounds cannot be assumed reversible.

## M9 Conclusion

Direct, block, and TCP relay are suitable candidates for a future limited
generation prototype because their established TCP sockets are self-owned and
their current objects have no persistent transport pool. This is not runtime
authorization. Shadowsocks, Trojan, WireGuard, UDP, and plugin outbounds remain
deferred until their identity, compatibility, and teardown evidence is
explicit.
