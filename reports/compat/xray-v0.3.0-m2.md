# xray External Compatibility v0.3.0 M2

- Generated: 2026-06-30T22:05:29.866Z
- Versions: Xray 26.3.27 (Xray, Penetrates Everything.) Custom (go1.26.1 darwin/arm64) A unified platform for anti-censorship.
- Summary: {"verified":21,"failed":0,"skipped":0,"blocked":0,"unsupported":1}

## Capability Notes

- Xray client pins the ephemeral certificate; sepigs outbound disables self-signed chain validation.
- Only sepigs-supported Shadowsocks AEAD ciphers are in scope.

| Case | Role | Protocol/cipher | Payload | Concurrency | Result | Reason | Reproduction |
| --- | --- | --- | ---: | ---: | --- | --- | --- |
| ss-xray-sepigs-outbound-aes-128-gcm-small | outbound | shadowsocks/aes-128-gcm | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-xray-sepigs-outbound-aes-128-gcm-small` |
| ss-xray-sepigs-outbound-aes-128-gcm-large | outbound | shadowsocks/aes-128-gcm | 1048576 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-xray-sepigs-outbound-aes-128-gcm-large` |
| ss-xray-sepigs-inbound-aes-128-gcm-small | inbound | shadowsocks/aes-128-gcm | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-xray-sepigs-inbound-aes-128-gcm-small` |
| ss-xray-sepigs-outbound-aes-256-gcm-small | outbound | shadowsocks/aes-256-gcm | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-xray-sepigs-outbound-aes-256-gcm-small` |
| ss-xray-sepigs-outbound-aes-256-gcm-large | outbound | shadowsocks/aes-256-gcm | 1048576 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-xray-sepigs-outbound-aes-256-gcm-large` |
| ss-xray-sepigs-inbound-aes-256-gcm-small | inbound | shadowsocks/aes-256-gcm | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-xray-sepigs-inbound-aes-256-gcm-small` |
| ss-xray-sepigs-outbound-chacha20-ietf-poly1305-small | outbound | shadowsocks/chacha20-ietf-poly1305 | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-xray-sepigs-outbound-chacha20-ietf-poly1305-small` |
| ss-xray-sepigs-outbound-chacha20-ietf-poly1305-large | outbound | shadowsocks/chacha20-ietf-poly1305 | 1048576 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-xray-sepigs-outbound-chacha20-ietf-poly1305-large` |
| ss-xray-sepigs-inbound-chacha20-ietf-poly1305-small | inbound | shadowsocks/chacha20-ietf-poly1305 | 31 | 1 | verified | payload integrity passed | `npm run compat:external:v1 -- --case ss-xray-sepigs-inbound-chacha20-ietf-poly1305-small` |
| ss-xray-sepigs-outbound-wrong-password | outbound | shadowsocks/aes-128-gcm | 31 | 1 | verified | wrong password was rejected | `npm run compat:external:v1 -- --case ss-xray-sepigs-outbound-wrong-password` |
| ss-xray-sepigs-inbound-wrong-password | inbound | shadowsocks/aes-128-gcm | 31 | 1 | verified | wrong password was rejected | `npm run compat:external:v1 -- --case ss-xray-sepigs-inbound-wrong-password` |
| ss-xray-sepigs-outbound-remote-close | outbound | shadowsocks/aes-128-gcm | 25 | 1 | verified | remote close propagated and resources were released | `npm run compat:external:v1 -- --case ss-xray-sepigs-outbound-remote-close` |
| ss-xray-sepigs-inbound-remote-close | inbound | shadowsocks/aes-128-gcm | 25 | 1 | verified | remote close propagated and resources were released | `npm run compat:external:v1 -- --case ss-xray-sepigs-inbound-remote-close` |
| trojan-xray-sepigs-outbound-small | outbound | trojan | 31 | 1 | verified | TLS payload integrity passed; ephemeral self-signed chain validation disabled | `npm run compat:external:v1 -- --case trojan-xray-sepigs-outbound-small` |
| trojan-xray-sepigs-inbound-small | inbound | trojan | 31 | 1 | verified | TLS payload integrity passed | `npm run compat:external:v1 -- --case trojan-xray-sepigs-inbound-small` |
| trojan-xray-sepigs-outbound-large | outbound | trojan | 1048576 | 1 | verified | TLS payload integrity passed; ephemeral self-signed chain validation disabled | `npm run compat:external:v1 -- --case trojan-xray-sepigs-outbound-large` |
| trojan-xray-sepigs-inbound-large | inbound | trojan | 1048576 | 1 | verified | TLS payload integrity passed | `npm run compat:external:v1 -- --case trojan-xray-sepigs-inbound-large` |
| trojan-xray-sepigs-outbound-wrong-password | outbound | trojan | 31 | 1 | verified | wrong password was rejected | `npm run compat:external:v1 -- --case trojan-xray-sepigs-outbound-wrong-password` |
| trojan-xray-sepigs-inbound-wrong-password | inbound | trojan | 31 | 1 | verified | wrong password was rejected | `npm run compat:external:v1 -- --case trojan-xray-sepigs-inbound-wrong-password` |
| trojan-xray-sepigs-outbound-remote-close | outbound | trojan | 25 | 1 | verified | TLS remote close propagated and resources were released | `npm run compat:external:v1 -- --case trojan-xray-sepigs-outbound-remote-close` |
| trojan-xray-sepigs-inbound-remote-close | inbound | trojan | 25 | 1 | verified | TLS remote close propagated and resources were released | `npm run compat:external:v1 -- --case trojan-xray-sepigs-inbound-remote-close` |
| trojan-public-plain-mode | inbound | trojan | 0 | 1 | unsupported | Trojan plaintext mode is a local fixture boundary and is not eligible for public interoperability verification | `npm run compat:external:v1 -- --case trojan-public-plain-mode` |

Only verified rows are positive external interoperability evidence.
