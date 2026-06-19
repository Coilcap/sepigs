# QUIC / Hysteria2 Research

## Feasibility

Node.js does not currently expose a stable built-in QUIC client/server API suitable for a production TypeScript proxy transport. A production implementation needs either a native addon, a maintained userland QUIC binding, or an external helper process.

## Options

- Native UDP plus QUIC library: best path if a maintained dependency is chosen.
- Plugin transport adapter: keeps core stable while QUIC evolves.
- External process adapter: strongest isolation, higher operational complexity.

## Hysteria2 Boundary

Hysteria2 is more than raw QUIC. It includes authentication, congestion behavior, UDP/TCP proxy semantics, and protocol framing. sepigs should not claim Hysteria2 support until those pieces are implemented and interoperable.

## Current Phase

Implemented:

- `QuicTransportAdapter` interface.
- Missing-dependency adapter with explicit error.
- Mock adapter for tests.

Not implemented:

- Native QUIC handshake.
- Hysteria2 framing/authentication.
- Interoperability with Hysteria2 clients.
