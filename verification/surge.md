# Surge Acceptance

Status: `verified`. The user manually confirmed all Surge acceptance checks
passed. Device, OS, client version, screenshots, and detailed logs were not
supplied and remain `unknown`.

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
| unknown | unknown | unknown | `verification/manual-pack/surge.conf` | User manual signoff / 2026-06-28 CST | verified | unknown |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Profile imports | No parser error | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| HTTP selection | URL loads | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| SOCKS5 selection | URL loads | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Metrics increment | Counters increase | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Rollback | Previous profile restored | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
