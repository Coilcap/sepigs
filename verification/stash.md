# Stash Acceptance

Status: `verified`. The user manually confirmed all Stash acceptance checks
passed. Device, OS, client version, screenshots, and detailed logs were not
supplied and remain `unknown`.

## Configuration

```yaml
proxies:
  - { name: sepigs-http, type: http, server: 127.0.0.1, port: 8080 }
  - { name: sepigs-socks, type: socks5, server: 127.0.0.1, port: 1080 }
proxy-groups:
  - name: SEPIGS
    type: select
    proxies: [sepigs-http, sepigs-socks, DIRECT]
rules:
  - MATCH,SEPIGS
```

Canonical file: `examples/clients/stash.yaml`.

## Import

1. Start sepigs and make its listener reachable from the Stash device.
2. Import `examples/clients/stash.yaml`.
3. Select each sepigs proxy in the `SEPIGS` group.
4. Disable the profile to roll back.

## Test URL

`https://example.com/`

## Expected Result

The URL loads through both HTTP and SOCKS5 selections, and sepigs metrics increase without failures.

## Execution Record

| Device | OS version | Client version | Config | Tester/time | Result | Failure log or screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| unknown | unknown | unknown | `verification/manual-pack/stash.yaml` | User manual signoff / 2026-06-28 CST | verified | unknown |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| YAML imports | No parser error | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| HTTP path | URL loads | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| SOCKS5 path | URL loads | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Metrics increment | Counters increase | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Rollback | Profile disabled | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
