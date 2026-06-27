# Mihomo Acceptance

Status: `verified`. The user manually confirmed all Mihomo acceptance checks
passed. Device, OS, client version, screenshots, and detailed logs were not
supplied and remain `unknown`.

## Configuration

```yaml
proxies:
  - name: sepigs-http
    type: http
    server: 127.0.0.1
    port: 8080
  - name: sepigs-socks
    type: socks5
    server: 127.0.0.1
    port: 1080
proxy-groups:
  - name: SEPIGS
    type: select
    proxies: [sepigs-http, sepigs-socks, DIRECT]
rules:
  - MATCH,SEPIGS
```

Canonical file: `examples/clients/mihomo.yaml`.

## Import

1. Start sepigs with `npm run dev`.
2. Import `examples/clients/mihomo.yaml` into Mihomo.
3. Select the `SEPIGS` group and choose `sepigs-http`, then repeat with `sepigs-socks`.
4. Disable the imported profile to roll back.

## Test URL

`https://example.com/`

## Expected Result

The page returns HTTP 200, Mihomo reports the selected sepigs proxy, and `sepigs_connections_total` increases without connection errors.

## Execution Record

| Device | OS version | Client version | Config | Tester/time | Result | Failure log or screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| unknown | unknown | unknown | `examples/clients/mihomo.yaml` | User manual signoff / 2026-06-28 CST | verified | unknown |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Config imports | No syntax error | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| HTTP proxy path | URL loads | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| SOCKS5 proxy path | URL loads | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Metrics increment | Connection counter increases | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Rollback | Direct traffic restored | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
