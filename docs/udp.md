# UDP

Phase 8 provides a real SOCKS5 UDP ASSOCIATE to outbound UDP path. Enable it per inbound with `"udpAssociate": true`.

- `UdpSessionManager` enforces `limits.maxUdpSessions` and `limits.udpIdleTimeoutMs`.
- `direct`, `block`, and Shadowsocks outbounds expose UDP behavior through the common outbound interface.
- Engine shutdown closes every tracked UDP relay and timer.
- Fragmented SOCKS5 UDP packets are rejected. UDP is request/response oriented; NAT-style multi-response flows remain experimental.

Metrics: `sepigs_udp_sessions_total`, `sepigs_udp_sessions_active`, `sepigs_udp_packets_upload_total`, `sepigs_udp_packets_download_total`, and `sepigs_udp_errors_total`.
