# Client Compatibility

Phase 11 keeps automated evidence separate from manual readiness. GUI and mobile clients are not marked verified unless the client actually ran in this environment.

Latest acceptance check: 2026-06-26 CST. The verification pack exists at `artifacts/sepigs-v0.2.0-client-verification-pack.zip`, but no P0/P1 GUI or mobile client has an executed human sign-off row yet.

## Automated Matrix

| Client | Status | Evidence | Result | Limitation |
| --- | --- | --- | --- | --- |
| curl HTTP proxy | verified | `npm run interop` | `sepigs-interop-http` | Local curl only. |
| curl SOCKS5 proxy | verified | `npm run interop` | `sepigs-interop-http` | Local curl only. |
| curl HTTP Basic Auth | verified | `npm run interop` | `sepigs-interop-http` | Local curl only. |
| curl SOCKS5 username/password | verified | `npm run interop` | `sepigs-interop-http` | Local curl only. |
| Node HTTP CONNECT client | verified | `npm run interop` | local echo response | Local TCP echo only. |
| Mihomo config syntax | skipped with reason | `npm run interop:validate` | YAML parse succeeded; `mihomo` binary not found | External binary not installed. |
| Stash config syntax | skipped with reason | `npm run interop:validate` | YAML parse succeeded; `stash` binary not found | External binary not installed. |
| Surge config syntax | skipped with reason | `npm run interop:validate` | Static sections valid; Surge CLI unavailable | External validator not installed. |

## Manual Matrix

| Client | Status | Config | Validation URL | Expected Result |
| --- | --- | --- | --- | --- |
| Chrome / system proxy | not tested; ready-for-human-signoff | [chrome-system.md](../verification/chrome-system.md) | `https://example.com/` | Page loads and sepigs metrics increment. |
| Mihomo | not tested; ready-for-human-signoff | [mihomo.md](../verification/mihomo.md) | `https://example.com/` | Selected `SEPIGS` policy reaches the URL. |
| Shadowrocket | not tested; ready-for-human-signoff | [shadowrocket.md](../verification/shadowrocket.md) | `https://example.com/` | Manual HTTP/SOCKS profile reaches the URL. |
| Clash Verge | not tested; ready-for-human-signoff | [clash-verge.md](../verification/clash-verge.md) | `https://example.com/` | Imported Mihomo profile reaches the URL. |
| NekoBox | not tested; ready-for-human-signoff | [nekobox.md](../verification/nekobox.md) | `https://example.com/` | Manual HTTP/SOCKS profile reaches the URL. |
| v2rayN | not tested; ready-for-human-signoff | [v2rayn.md](../verification/v2rayn.md) | `https://example.com/` | Manual HTTP/SOCKS profile reaches the URL. |
| Surge | not tested; ready-for-human-signoff | [surge.md](../verification/surge.md) | `https://example.com/` | `SEPIGS` policy reaches the URL. |
| Stash | not tested; ready-for-human-signoff | [stash.md](../verification/stash.md) | `https://example.com/` | `SEPIGS` policy reaches the URL. |

## Reproduction

Generate configs:

```bash
npm run interop:configs
```

Validate local syntax where possible:

```bash
npm run interop:validate
```

Run automated curl/Node checks:

```bash
npm run interop
```

Rollback for GUI/mobile tests is always to disable the imported profile or restore the OS proxy setting to direct mode.
