# Mihomo Acceptance

Status: ready for manual sign-off. Not yet verified by a real Mihomo process.

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

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Config imports | No syntax error | Pending | Pending | Screenshot/log |
| HTTP proxy path | URL loads | Pending | Pending | Mihomo connection log |
| SOCKS5 proxy path | URL loads | Pending | Pending | Mihomo connection log |
| Metrics increment | Connection counter increases | Pending | Pending | `/metrics` capture |
| Rollback | Direct traffic restored | Pending | Pending | Screenshot |
