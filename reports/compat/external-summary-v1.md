# External Compatibility Summary v1

- Generated: 2026-06-30T22:05:29.865Z
- Detection generated: 2026-06-30T22:05:20.085Z
- Harness generated: 2026-06-30T22:05:29.605Z
- Result counts: {"verified":44,"failed":0,"skipped":28,"blocked":0,"unsupported":2}

## Reference Detection

| Implementation | Status | Versions |
| --- | --- | --- |
| shadowsocks-rust | missing | ssserver: missing; sslocal: missing |
| shadowsocks-libev | missing | ss-server: missing; ss-local: missing |
| sing-box | available | sing-box: sing-box version 1.13.14 Environment: go1.26.4 darwin/arm64 Tags: with_gvisor,with_quic,with_dhcp,with_wireguard,with_utls,with_acme,with_clash_api,with_tailscale,with_ccm,with_ocm,with_naive_outbound,badlinkname,tfogo_checklinkname0 CGO: enabled |
| xray | available | xray: Xray 26.3.27 (Xray, Penetrates Everything.) Custom (go1.26.1 darwin/arm64) A unified platform for anti-censorship. |
| trojan-go | missing | trojan-go: missing |

## Harness Results

| Case | Reference | Result | Reason |
| --- | --- | --- | --- |
| ss-shadowsocks-rust-sepigs-outbound-aes-128-gcm-small | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-rust-sepigs-outbound-aes-128-gcm-large | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-rust-sepigs-inbound-aes-128-gcm-small | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-rust-sepigs-outbound-aes-256-gcm-small | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-rust-sepigs-outbound-aes-256-gcm-large | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-rust-sepigs-inbound-aes-256-gcm-small | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-rust-sepigs-outbound-chacha20-ietf-poly1305-small | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-rust-sepigs-outbound-chacha20-ietf-poly1305-large | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-rust-sepigs-inbound-chacha20-ietf-poly1305-small | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-rust-sepigs-outbound-wrong-password | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-rust-sepigs-inbound-wrong-password | shadowsocks-rust | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-outbound-aes-128-gcm-small | shadowsocks-libev | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-outbound-aes-128-gcm-large | shadowsocks-libev | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-inbound-aes-128-gcm-small | shadowsocks-libev | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-outbound-aes-256-gcm-small | shadowsocks-libev | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-outbound-aes-256-gcm-large | shadowsocks-libev | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-inbound-aes-256-gcm-small | shadowsocks-libev | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-outbound-chacha20-ietf-poly1305-small | shadowsocks-libev | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-outbound-chacha20-ietf-poly1305-large | shadowsocks-libev | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-inbound-chacha20-ietf-poly1305-small | shadowsocks-libev | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-outbound-wrong-password | shadowsocks-libev | skipped | reference binary status is missing |
| ss-shadowsocks-libev-sepigs-inbound-wrong-password | shadowsocks-libev | skipped | reference binary status is missing |
| ss-sing-box-sepigs-outbound-aes-128-gcm-small | sing-box | verified | payload integrity passed |
| ss-sing-box-sepigs-outbound-aes-128-gcm-large | sing-box | verified | payload integrity passed |
| ss-sing-box-sepigs-inbound-aes-128-gcm-small | sing-box | verified | payload integrity passed |
| ss-sing-box-sepigs-outbound-aes-256-gcm-small | sing-box | verified | payload integrity passed |
| ss-sing-box-sepigs-outbound-aes-256-gcm-large | sing-box | verified | payload integrity passed |
| ss-sing-box-sepigs-inbound-aes-256-gcm-small | sing-box | verified | payload integrity passed |
| ss-sing-box-sepigs-outbound-chacha20-ietf-poly1305-small | sing-box | verified | payload integrity passed |
| ss-sing-box-sepigs-outbound-chacha20-ietf-poly1305-large | sing-box | verified | payload integrity passed |
| ss-sing-box-sepigs-inbound-chacha20-ietf-poly1305-small | sing-box | verified | payload integrity passed |
| ss-sing-box-sepigs-outbound-wrong-password | sing-box | verified | wrong password was rejected |
| ss-sing-box-sepigs-inbound-wrong-password | sing-box | verified | wrong password was rejected |
| ss-sing-box-sepigs-outbound-remote-close | sing-box | verified | remote close propagated and resources were released |
| ss-sing-box-sepigs-inbound-remote-close | sing-box | verified | remote close propagated and resources were released |
| ss-sing-box-sepigs-outbound-concurrent-8 | sing-box | verified | 8 concurrent payload exchanges passed |
| ss-sing-box-sepigs-inbound-concurrent-8 | sing-box | verified | 8 concurrent payload exchanges passed |
| ss-xray-sepigs-outbound-aes-128-gcm-small | xray | verified | payload integrity passed |
| ss-xray-sepigs-outbound-aes-128-gcm-large | xray | verified | payload integrity passed |
| ss-xray-sepigs-inbound-aes-128-gcm-small | xray | verified | payload integrity passed |
| ss-xray-sepigs-outbound-aes-256-gcm-small | xray | verified | payload integrity passed |
| ss-xray-sepigs-outbound-aes-256-gcm-large | xray | verified | payload integrity passed |
| ss-xray-sepigs-inbound-aes-256-gcm-small | xray | verified | payload integrity passed |
| ss-xray-sepigs-outbound-chacha20-ietf-poly1305-small | xray | verified | payload integrity passed |
| ss-xray-sepigs-outbound-chacha20-ietf-poly1305-large | xray | verified | payload integrity passed |
| ss-xray-sepigs-inbound-chacha20-ietf-poly1305-small | xray | verified | payload integrity passed |
| ss-xray-sepigs-outbound-wrong-password | xray | verified | wrong password was rejected |
| ss-xray-sepigs-inbound-wrong-password | xray | verified | wrong password was rejected |
| ss-xray-sepigs-outbound-remote-close | xray | verified | remote close propagated and resources were released |
| ss-xray-sepigs-inbound-remote-close | xray | verified | remote close propagated and resources were released |
| trojan-sing-box-sepigs-outbound-small | sing-box | verified | TLS payload integrity passed; ephemeral self-signed chain validation disabled |
| trojan-sing-box-sepigs-inbound-small | sing-box | verified | TLS payload integrity passed |
| trojan-sing-box-sepigs-outbound-large | sing-box | verified | TLS payload integrity passed; ephemeral self-signed chain validation disabled |
| trojan-sing-box-sepigs-inbound-large | sing-box | verified | TLS payload integrity passed |
| trojan-sing-box-sepigs-outbound-wrong-password | sing-box | verified | wrong password was rejected |
| trojan-sing-box-sepigs-inbound-wrong-password | sing-box | verified | wrong password was rejected |
| trojan-sing-box-sepigs-outbound-remote-close | sing-box | verified | TLS remote close propagated and resources were released |
| trojan-sing-box-sepigs-inbound-remote-close | sing-box | verified | TLS remote close propagated and resources were released |
| trojan-xray-sepigs-outbound-small | xray | verified | TLS payload integrity passed; ephemeral self-signed chain validation disabled |
| trojan-xray-sepigs-inbound-small | xray | verified | TLS payload integrity passed |
| trojan-xray-sepigs-outbound-large | xray | verified | TLS payload integrity passed; ephemeral self-signed chain validation disabled |
| trojan-xray-sepigs-inbound-large | xray | verified | TLS payload integrity passed |
| trojan-xray-sepigs-outbound-wrong-password | xray | verified | wrong password was rejected |
| trojan-xray-sepigs-inbound-wrong-password | xray | verified | wrong password was rejected |
| trojan-xray-sepigs-outbound-remote-close | xray | verified | TLS remote close propagated and resources were released |
| trojan-xray-sepigs-inbound-remote-close | xray | verified | TLS remote close propagated and resources were released |
| trojan-trojan-go-sepigs-outbound-small | trojan-go | skipped | reference binary status is missing |
| trojan-trojan-go-sepigs-inbound-small | trojan-go | skipped | reference binary status is missing |
| trojan-trojan-go-sepigs-outbound-large | trojan-go | skipped | reference binary status is missing |
| trojan-trojan-go-sepigs-inbound-large | trojan-go | skipped | reference binary status is missing |
| trojan-trojan-go-sepigs-outbound-wrong-password | trojan-go | skipped | reference binary status is missing |
| trojan-trojan-go-sepigs-inbound-wrong-password | trojan-go | skipped | reference binary status is missing |
| ss-udp-inbound-external | sing-box | unsupported | Shadowsocks UDP inbound certification is outside the current sepigs capability boundary |
| trojan-public-plain-mode | xray | unsupported | Trojan plaintext mode is a local fixture boundary and is not eligible for public interoperability verification |

Only cases marked verified have external process and payload evidence.
