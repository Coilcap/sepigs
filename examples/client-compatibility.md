# Client Compatibility Evidence

## Verified Locally

| Client | Status | Evidence |
| --- | --- | --- |
| curl HTTP proxy | verified | `npm run interop` |
| curl SOCKS5 proxy | verified | `npm run interop` |
| curl HTTP Basic Auth | verified | `npm run interop` |
| curl SOCKS5 username/password | verified | `npm run interop` |
| Node HTTP CONNECT client | verified | `npm run interop` |

## Ready For Manual Verification

| Client | Config | Status |
| --- | --- | --- |
| Chrome / system proxy | [clients/chrome-system.md](clients/chrome-system.md) | ready-for-manual-verification |
| Clash / Mihomo | [clients/mihomo.yaml](clients/mihomo.yaml) | ready-for-manual-verification |
| Shadowrocket | [clients/shadowrocket.md](clients/shadowrocket.md) | ready-for-manual-verification |
| NekoBox | [clients/nekobox.md](clients/nekobox.md) | ready-for-manual-verification |
| v2rayN | [clients/v2rayn.md](clients/v2rayn.md) | ready-for-manual-verification |
| Surge | [clients/surge.conf](clients/surge.conf) | ready-for-manual-verification |
| Stash | [clients/stash.yaml](clients/stash.yaml) | ready-for-manual-verification |

`npm run interop:validate` currently records Mihomo/Stash/Surge as skipped when their local validators are unavailable. These rows are intentionally not marked verified.
