# UDP Benchmark

`npm run benchmark:udp` sends 2,000 request/response packets through a real SOCKS5 UDP ASSOCIATE and direct outbound.

- Success: 2,000/2,000
- Errors: 0
- Payload: 256 bytes
- Throughput: 32.69 Mbps
- Latency p50/p95/p99: 0.09/0.18/0.30 ms
- RSS before/after: 93.38/99.80 MiB
- Final sockets/timers/listeners: 0/0/0

This loopback benchmark validates lifecycle and regression behavior. It does not model WAN loss, fragmentation, NAT rebinding, amplification attacks, or thousands of simultaneous UDP associations.
