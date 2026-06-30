# sing-box External Compatibility v0.3.0 M2

- Generated: 2026-06-30T22:05:29.866Z
- Versions: sing-box version 1.13.14 Environment: go1.26.4 darwin/arm64 Tags: with_gvisor,with_quic,with_dhcp,with_wireguard,with_utls,with_acme,with_clash_api,with_tailscale,with_ccm,with_ocm,with_naive_outbound,badlinkname,tfogo_checklinkname0 CGO: enabled
- Summary: {"verified":23,"failed":0,"skipped":0,"blocked":0,"unsupported":1}

## Capability Notes

- Ephemeral self-signed TLS proves encrypted interoperability, not public-PKI validation.
- Shadowsocks UDP certification remains unsupported.

| Case | Role | Protocol/cipher | Payload | Concurrency | Result | Reason | Reproduction |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| ss-sing-box-sepigs-outbound-aes-128-gcm-small | outbound | shadowsocks/aes-128-gcm | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-outbound-aes-128-gcm-small` |
| ss-sing-box-sepigs-outbound-aes-128-gcm-large | outbound | shadowsocks/aes-128-gcm | 1048576 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-outbound-aes-128-gcm-large` |
| ss-sing-box-sepigs-inbound-aes-128-gcm-small | inbound | shadowsocks/aes-128-gcm | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-inbound-aes-128-gcm-small` |
| ss-sing-box-sepigs-outbound-aes-256-gcm-small | outbound | shadowsocks/aes-256-gcm | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-outbound-aes-256-gcm-small` |
| ss-sing-box-sepigs-outbound-aes-256-gcm-large | outbound | shadowsocks/aes-256-gcm | 1048576 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-outbound-aes-256-gcm-large` |
| ss-sing-box-sepigs-inbound-aes-256-gcm-small | inbound | shadowsocks/aes-256-gcm | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-inbound-aes-256-gcm-small` |
| ss-sing-box-sepigs-outbound-chacha20-ietf-poly1305-small | outbound | shadowsocks/chacha20-ietf-poly1305 | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-outbound-chacha20-ietf-poly1305-small` |
| ss-sing-box-sepigs-outbound-chacha20-ietf-poly1305-large | outbound | shadowsocks/chacha20-ietf-poly1305 | 1048576 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-outbound-chacha20-ietf-poly1305-large` |
| ss-sing-box-sepigs-inbound-chacha20-ietf-poly1305-small | inbound | shadowsocks/chacha20-ietf-poly1305 | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-inbound-chacha20-ietf-poly1305-small` |
| ss-sing-box-sepigs-outbound-wrong-password | outbound | shadowsocks/aes-128-gcm | 31 | 1 | verified | wrong password was rejected | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-outbound-wrong-password` |
| ss-sing-box-sepigs-inbound-wrong-password | inbound | shadowsocks/aes-128-gcm | 31 | 1 | verified | wrong password was rejected | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-inbound-wrong-password` |
| ss-sing-box-sepigs-outbound-remote-close | outbound | shadowsocks/aes-128-gcm | 25 | 1 | verified | remote close propagated and resources were released | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-outbound-remote-close` |
| ss-sing-box-sepigs-inbound-remote-close | inbound | shadowsocks/aes-128-gcm | 25 | 1 | verified | remote close propagated and resources were released | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-inbound-remote-close` |
| ss-sing-box-sepigs-outbound-concurrent-8 | outbound | shadowsocks/aes-256-gcm | 31 | 8 | verified | 8 concurrent payload exchanges passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-outbound-concurrent-8` |
| ss-sing-box-sepigs-inbound-concurrent-8 | inbound | shadowsocks/aes-256-gcm | 31 | 8 | verified | 8 concurrent payload exchanges passed | `npm run compat:external:v1 -- --case ss-sing-box-sepigs-inbound-concurrent-8` |
| trojan-sing-box-sepigs-outbound-small | outbound | trojan | 31 | 1 | verified | TLS payload integrity passed; ephemeral self-signed chain validation disabled | `npm run compat:external:v1 -- --case trojan-sing-box-sepigs-outbound-small` |
| trojan-sing-box-sepigs-inbound-small | inbound | trojan | 31 | 1 | verified | TLS payload integrity passed | `npm run compat:external:v1 -- --case trojan-sing-box-sepigs-inbound-small` |
| trojan-sing-box-sepigs-outbound-large | outbound | trojan | 1048576 | 1 | verified | TLS payload integrity passed; ephemeral self-signed chain validation disabled | `npm run compat:external:v1 -- --case trojan-sing-box-sepigs-outbound-large` |
| trojan-sing-box-sepigs-inbound-large | inbound | trojan | 1048576 | 1 | verified | TLS payload integrity passed | `npm run compat:external:v1 -- --case trojan-sing-box-sepigs-inbound-large` |
| trojan-sing-box-sepigs-outbound-wrong-password | outbound | trojan | 31 | 1 | verified | wrong password was rejected | `npm run compat:external:v1 -- --case trojan-sing-box-sepigs-outbound-wrong-password` |
| trojan-sing-box-sepigs-inbound-wrong-password | inbound | trojan | 31 | 1 | verified | wrong password was rejected | `npm run compat:external:v1 -- --case trojan-sing-box-sepigs-inbound-wrong-password` |
| trojan-sing-box-sepigs-outbound-remote-close | outbound | trojan | 25 | 1 | verified | TLS remote close propagated and resources were released | `npm run compat:external:v1 -- --case trojan-sing-box-sepigs-outbound-remote-close` |
| trojan-sing-box-sepigs-inbound-remote-close | inbound | trojan | 25 | 1 | verified | TLS remote close propagated and resources were released | `npm run compat:external:v1 -- --case trojan-sing-box-sepigs-inbound-remote-close` |
| ss-udp-inbound-external | inbound | shadowsocks | 0 | 1 | unsupported | Shadowsocks UDP inbound certification is outside the current sepigs capability boundary | `npm run compat:external:v1 -- --case ss-udp-inbound-external` |

Only verified rows are positive external interoperability evidence.
