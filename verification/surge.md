# Surge Acceptance

Status: ready for manual sign-off. Static section validation passed; real Surge execution is pending.

## Configuration

```ini
[Proxy]
sepigs-http = http, 127.0.0.1, 8080
sepigs-socks = socks5, 127.0.0.1, 1080

[Proxy Group]
SEPIGS = select, sepigs-http, sepigs-socks, DIRECT

[Rule]
FINAL,SEPIGS
```

Canonical file: `examples/clients/surge.conf`.

## Import

1. Start sepigs with local HTTP and SOCKS5 listeners.
2. Import `examples/clients/surge.conf` into Surge.
3. Select `sepigs-http`, then `sepigs-socks` in the `SEPIGS` policy.
4. Restore the previous Surge profile to roll back.

## Test URL

`https://example.com/`

## Expected Result

Both proxy selections load the URL and produce successful connections in Surge and sepigs metrics.

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Profile imports | No parser error | Pending | Pending | Screenshot |
| HTTP selection | URL loads | Pending | Pending | Request log |
| SOCKS5 selection | URL loads | Pending | Pending | Request log |
| Metrics increment | Counters increase | Pending | Pending | `/metrics` capture |
| Rollback | Previous profile restored | Pending | Pending | Screenshot |
