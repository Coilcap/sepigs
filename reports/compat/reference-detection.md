# External Reference Detection

- Generated: 2026-06-30T22:05:20.085Z
- Platform: darwin
- Architecture: arm64

| Implementation | Status | Binary | Binary status | Version command | Version output | Install hint |
| --- | --- | --- | --- | --- | --- | --- |
| shadowsocks-rust | missing | ssserver | missing | `ssserver --version` | n/a | `cargo install shadowsocks-rust --version 1.24.0` |
| shadowsocks-rust | missing | sslocal | missing | `sslocal --version` | n/a | `cargo install shadowsocks-rust --version 1.24.0` |
| shadowsocks-libev | missing | ss-server | missing | `ss-server -h` | n/a | `brew install shadowsocks-libev` |
| shadowsocks-libev | missing | ss-local | missing | `ss-local -h` | n/a | `brew install shadowsocks-libev` |
| sing-box | available | sing-box | available | `${HOMEBREW_PREFIX}/bin/sing-box version` | sing-box version 1.13.14 Environment: go1.26.4 darwin/arm64 Tags: with_gvisor,with_quic,with_dhcp,with_wireguard,with_utls,with_acme,with_clash_api,with_tailscale,with_ccm,with_ocm,with_naive_outbound,badlinkname,tfogo_checklinkname0 CGO: enabled | `brew install sing-box` |
| xray | available | xray | available | `${HOMEBREW_PREFIX}/bin/xray version` | Xray 26.3.27 (Xray, Penetrates Everything.) Custom (go1.26.1 darwin/arm64) A unified platform for anti-censorship. | `brew install xray` |
| trojan-go | missing | trojan-go | missing | `trojan-go -version` | n/a | `go install github.com/p4gefau1t/trojan-go@v0.10.6` |

Detection does not imply interoperability verification.
