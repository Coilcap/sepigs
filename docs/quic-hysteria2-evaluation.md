# QUIC and Hysteria2 Evaluation

Node.js 20 does not provide a stable, portable public QUIC API suitable for this core. Native addons and external QUIC processes add ABI, packaging, and sandbox concerns. Phase 8 keeps a typed adapter registry, missing-dependency error, mock echo adapter, and an explicit experimental opt-in wrapper.

No real QUIC handshake or Hysteria2 protocol is claimed. Hysteria2 also requires TLS identity, QUIC stream/datagram semantics, congestion behavior, authentication, and interoperability fixtures. A future implementation should use a maintained native library behind the adapter and a separately versioned compatibility suite.
