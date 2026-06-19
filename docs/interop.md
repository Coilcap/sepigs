# Client Compatibility

Phase 7 keeps automated evidence separate from manual readiness. GUI and mobile clients are not marked verified unless the client actually ran in this environment.

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
| Chrome / system proxy | ready-for-manual-verification | [chrome-system.md](../examples/clients/chrome-system.md) | `https://example.com/` | Page loads and sepigs metrics increment. |
| Clash / Mihomo | ready-for-manual-verification | [mihomo.yaml](../examples/clients/mihomo.yaml) | `https://example.com/` | Selected `SEPIGS` policy reaches the URL. |
| Shadowrocket | ready-for-manual-verification | [shadowrocket.md](../examples/clients/shadowrocket.md) | `https://example.com/` | Manual HTTP/SOCKS profile reaches the URL. |
| NekoBox | ready-for-manual-verification | [nekobox.md](../examples/clients/nekobox.md) | `https://example.com/` | Manual HTTP/SOCKS profile reaches the URL. |
| v2rayN | ready-for-manual-verification | [v2rayn.md](../examples/clients/v2rayn.md) | `https://example.com/` | Manual HTTP/SOCKS profile reaches the URL. |
| Surge | ready-for-manual-verification | [surge.conf](../examples/clients/surge.conf) | `https://example.com/` | `SEPIGS` policy reaches the URL. |
| Stash | ready-for-manual-verification | [stash.yaml](../examples/clients/stash.yaml) | `https://example.com/` | `SEPIGS` policy reaches the URL. |

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
