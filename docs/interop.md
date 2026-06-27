# Client Compatibility

Phase 11 keeps automated evidence separate from manual readiness. GUI and mobile clients are not marked verified unless the client actually ran in this environment.

Latest acceptance check: 2026-06-28 CST. The verification pack exists at
`artifacts/sepigs-v0.2.0-client-verification-pack.zip`. The user manually
confirmed all P0 and P1 clients passed. Device models, OS versions, client
versions, screenshots, and detailed logs were not supplied and are recorded as
`unknown` in the individual worksheets.

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
| Chrome / system proxy | verified by user manual signoff | [chrome-system.md](../verification/chrome-system.md) | `https://example.com/` | All worksheet checks reported passed; detailed metadata unknown. |
| Mihomo | verified by user manual signoff | [mihomo.md](../verification/mihomo.md) | `https://example.com/` | All worksheet checks reported passed; detailed metadata unknown. |
| Shadowrocket | verified by user manual signoff | [shadowrocket.md](../verification/shadowrocket.md) | `https://example.com/` | All worksheet checks reported passed; detailed metadata unknown. |
| Clash Verge | verified by user manual signoff | [clash-verge.md](../verification/clash-verge.md) | `https://example.com/` | All worksheet checks reported passed; detailed metadata unknown. |
| NekoBox | verified by user manual signoff | [nekobox.md](../verification/nekobox.md) | `https://example.com/` | All worksheet checks reported passed; detailed metadata unknown. |
| v2rayN | verified by user manual signoff | [v2rayn.md](../verification/v2rayn.md) | `https://example.com/` | All worksheet checks reported passed; detailed metadata unknown. |
| Surge | verified by user manual signoff | [surge.md](../verification/surge.md) | `https://example.com/` | All worksheet checks reported passed; detailed metadata unknown. |
| Stash | verified by user manual signoff | [stash.md](../verification/stash.md) | `https://example.com/` | All worksheet checks reported passed; detailed metadata unknown. |

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
