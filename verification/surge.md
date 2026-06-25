# Surge Acceptance

Status: `not tested`. Sign-off readiness: `ready-for-human-signoff`. Static section validation passed; real Surge execution is pending.

Phase 11 check: verification pack present; Surge was not available for a real client run.

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

## Execution Record

| Device | OS version | Client version | Config | Tester/time | Result | Failure log or screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | `verification/manual-pack/surge.conf` | Pending | not tested | Pending |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Profile imports | No parser error | Pending | Pending | Screenshot |
| HTTP selection | URL loads | Pending | Pending | Request log |
| SOCKS5 selection | URL loads | Pending | Pending | Request log |
| Metrics increment | Counters increase | Pending | Pending | `/metrics` capture |
| Rollback | Previous profile restored | Pending | Pending | Screenshot |
