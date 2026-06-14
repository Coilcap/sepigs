# Stability

sepigs second-stage hardening focuses on long-running behavior rather than new protocols.

## Connection Manager

Every accepted TCP control connection is registered with:

- connection id
- inbound tag
- protocol and network
- source address
- destination address after handshake parsing
- start time and duration
- uploaded and downloaded bytes
- state and close reason

The engine exposes:

- `getActiveConnections()`
- `closeConnection(id, reason)`
- `getStats()`
- `getLeakSnapshot()`
- `getResourceSnapshot()`

## Resource Limiter

`limits.maxConnections` caps active managed connections. When the cap is reached, HTTP inbound returns `503 Service Unavailable`; SOCKS closes the new control socket before allocating more state. Rejections are counted in both resource and statistics snapshots.

## Timeout System

Connections start in `handshake` state with `limits.handshakeTimeoutMs`. Successful handshakes move to `established` and refresh an idle timer on traffic. Expired handshakes, idle tunnels, socket errors, and forced closes all converge through `ConnectionManager.close()`.

## Leak Detector

The leak detector tracks accepted client sockets, remote sockets, lifecycle timers, and listener counts on tracked emitters. It logs periodic status at `limits.leakReportIntervalMs` and reports warnings when listener counts look suspicious.

## Fault Injection Coverage

Automated tests cover:

- partial HTTP handshake timeout
- DNS failure via invalid host syntax
- broken pipe / client close
- resource limiter rejection
- forced connection close
- shutdown cleanup returning tracked sockets and timers to zero

## Self Healing

Self healing is intentionally conservative:

- stuck handshakes are closed by the handshake timer
- idle established connections are closed by the idle timer
- socket errors close both sides of a tunnel
- engine shutdown closes all active managed connections
- leak detector warnings surface abnormal resource growth
