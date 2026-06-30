# External Reference Fingerprints

- Generated: 2026-06-30T22:05:19.833Z
- Platform: darwin
- Architecture: arm64
- Paths are local-only redacted representations; binaries are not embedded.

| Implementation | Binary | Status | Version | Entry SHA-256 | Entry bytes | Path | Execution target | Target SHA-256 | Target bytes | Source | Trust note |
| --- | --- | --- | --- | --- | ---: | --- | --- | --- | ---: | --- | --- |
| shadowsocks-rust | ssserver | not-available | n/a | n/a | 0 | `missing` | `n/a` | n/a | 0 | unknown | No digest computed because detection status is missing. |
| shadowsocks-rust | sslocal | not-available | n/a | n/a | 0 | `missing` | `n/a` | n/a | 0 | unknown | No digest computed because detection status is missing. |
| shadowsocks-libev | ss-server | not-available | n/a | n/a | 0 | `missing` | `n/a` | n/a | 0 | unknown | No digest computed because detection status is missing. |
| shadowsocks-libev | ss-local | not-available | n/a | n/a | 0 | `missing` | `n/a` | n/a | 0 | unknown | No digest computed because detection status is missing. |
| sing-box | sing-box | fingerprinted | sing-box version 1.13.14 Environment: go1.26.4 darwin/arm64 Tags: with_gvisor,with_quic,with_dhcp,with_wireguard,with_utls,with_acme,with_clash_api,with_tailscale,with_ccm,with_ocm,with_naive_outbound,badlinkname,tfogo_checklinkname0 CGO: enabled | 5f2ac89b0bbb421059dba7e2b390dec78e662450159417b802df67e329d7398a | 50007970 | `${HOMEBREW_PREFIX}/bin/sing-box` | `${HOMEBREW_PREFIX}/Cellar/sing-box/1.13.14/bin/sing-box` | 5f2ac89b0bbb421059dba7e2b390dec78e662450159417b802df67e329d7398a | 50007970 | brew | Local Homebrew installation; formula provenance and bottle checksum require separate review. |
| xray | xray | fingerprinted | Xray 26.3.27 (Xray, Penetrates Everything.) Custom (go1.26.1 darwin/arm64) A unified platform for anti-censorship. | 04e4f982f3026b039746c309205064eb8c656cf8f74a41ea0c74ee90b33a7d04 | 163 | `${HOMEBREW_PREFIX}/bin/xray` | `${HOMEBREW_PREFIX}/Cellar/xray/26.3.27/libexec/xray` | 95984ec72638f96f0c576246e91ad2fff978557cf8e37e3e6111ee595030b2f7 | 29820546 | brew | Local Homebrew installation; formula provenance and bottle checksum require separate review. The detected entry is a wrapper; the separately fingerprinted execution target is the payload. |
| trojan-go | trojan-go | not-available | n/a | n/a | 0 | `missing` | `n/a` | n/a | 0 | unknown | No digest computed because detection status is missing. |

A fingerprint identifies the local file used by a run; it does not by itself establish upstream trust.
