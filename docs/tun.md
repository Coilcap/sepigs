# TUN Architecture

TUN is experimental and disabled by default. Phase 8 defines device, route, packet, and stack boundaries plus an IPv4 parser that classifies TCP, UDP, and other packets. A deterministic mock device is tested.

No bundled native device or user-space TCP/IP stack exists. `createTunDevice` therefore reports an explicit unsupported boundary. Real Linux/macOS adapters require root or administrator privileges, route rollback, DNS ownership, MTU handling, and platform-specific packet framing. Do not enable TUN for production traffic.
