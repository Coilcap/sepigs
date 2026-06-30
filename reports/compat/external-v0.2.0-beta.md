# External Compatibility v0.2.0-beta.0

No external interoperability result is claimed unless a vetted reference launcher completes the case.

Summary: 0 verified, 11 blocked, 0 failed.

## Binary Detection

- shadowsocks-rust: missing (sslocal, ssserver)
- shadowsocks-libev: missing (ss-local, ss-server)
- trojan-go: missing (trojan-go)
- sing-box: detected at ${HOMEBREW_PREFIX}/bin/sing-box
- xray: detected at ${HOMEBREW_PREFIX}/bin/xray

Installation suggestions:

- `cargo install shadowsocks-rust`
- `brew install shadowsocks-libev`
- `brew install sing-box`
- `brew install xray`
- `go install github.com/p4gefau1t/trojan-go@latest`

| Protocol | Case | Status | Reason |
| --- | --- | --- | --- |
| shadowsocks | reference client -> sepigs inbound aes-128-gcm | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |
| shadowsocks | reference client -> sepigs inbound aes-256-gcm | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |
| shadowsocks | reference client -> sepigs inbound chacha20-ietf-poly1305 | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |
| shadowsocks | wrong password | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |
| shadowsocks | large payload | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |
| shadowsocks | remote close | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |
| trojan | reference client -> sepigs inbound | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box, ${HOMEBREW_PREFIX}/bin/xray) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |
| trojan | wrong password | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box, ${HOMEBREW_PREFIX}/bin/xray) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |
| trojan | large payload | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box, ${HOMEBREW_PREFIX}/bin/xray) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |
| trojan | remote close | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box, ${HOMEBREW_PREFIX}/bin/xray) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |
| trojan | TLS termination and SNI | blocked-with-reason | Blocked: external reference binary detected (${HOMEBREW_PREFIX}/bin/sing-box, ${HOMEBREW_PREFIX}/bin/xray) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed. |

Local fixtures remain covered by `npm test`; they are not external reference evidence.
