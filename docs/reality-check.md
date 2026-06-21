# Reality Check

Phase 8 status is maintained in [phase8-reality-check.md](phase8-reality-check.md).

Superseded for RC1 by `docs/reality-check-v2.md`.

Updated for Phase 7.

## Really Usable

- HTTP inbound: CONNECT, absolute-form forwarding, optional Basic Auth, and close accounting are covered by end-to-end tests.
- SOCKS5 inbound: CONNECT, optional UDP ASSOCIATE, username/password auth, and close accounting are covered by tests.
- direct, block, tcpRelay, Shadowsocks, and Trojan outbounds are connected through the unified outbound registry.
- Routing policy: round-robin, least-latency data, and failover are used by Engine when selecting outbound candidates.
- Hot reload for route/outbound/DNS/policy updates is in the main Engine path.
- Inbound drain-and-rebind is implemented with rollback when replacement listener startup fails.
- Worker pool, WASM loader, plugin manifest validation, and plugin permission gating have focused tests.
- Remote plugin outbound factory RPC works for worker-thread and child-process plugin isolation without passing socket handles.
- Benchmark tooling starts a real local sepigs engine and echo target.
- Full soak tooling writes checkpoints, JSONL metrics, markdown summaries, failure samples, and final connection dumps.
- Prometheus metrics and alert rules are parse-tested against exported metric names.
- `docs:check` validates npm script references, local markdown links, and example sepigs configs.

## Ready For Manual Verification

- Chrome/system proxy, Mihomo, Shadowrocket, NekoBox, v2rayN, Surge, and Stash have generated configs and manual checklists.
- Mihomo/Stash YAML parses locally; external validators were skipped when binaries were unavailable.
- Surge config received static section validation; no Surge CLI validator was available.

## Interface Or Reservation

- QUIC is an adapter boundary. The default adapter reports dependency missing; mock adapter is test-only.
- WireGuard outbound validates config and reports a packet-tunnel requirement; it does not carry traffic.
- DoH and fake-ip are architecture boundaries; DoH has a mock-tested resolver path, fake-ip is not active.
- `wasm-header-transform` is an example package; header transformation is not wired into the data path.
- Remote plugin RPC is control-plane only: plugins can choose direct/block, but cannot own streams or receive socket handles.

## Risk Modules

- Plugin sandbox is API permission gating plus optional worker/process isolation, not a complete OS sandbox.
- Hot reload can drain/rebind listeners, but same-address protocol replacement cannot be perfectly atomic without socket activation or a drain window.
- TCP connection pool is safe for control-plane reuse only; arbitrary proxy tunnels are not reused.
- Active probing is available as a subsystem but does not yet auto-build real network probes for every outbound type.
- External Shadowsocks/Trojan reference implementations were not installed locally, so ecosystem compatibility is `skipped-with-reason`.

## Needs Refactor Before Production

- Lifecycle should gain unregister support so repeated hot reloads do not leave stopped services in the lifecycle list.
- Inbound stop/drain should expose separate listener and active-socket accounting.
- DNS should split system, UDP, DoH, and fake-ip into strategy classes.
- Untrusted plugins should default to child-process isolation with a stricter OS/container sandbox in production packaging.

## Production Blockers

- Native QUIC/Hysteria2 and WireGuard packet transports are not complete.
- The clean 1h full soak passed with 456,990 operations and zero errors. The 6h profile passed a 10-minute substitute, but a full six-hour run on the deployment host remains required before production claims.
- GUI/mobile client compatibility must be manually verified before being advertised as verified.
- External Shadowsocks/Trojan interoperability must be rerun when reference binaries are available.
