# Stash Acceptance

Status: `not tested`. Sign-off readiness: `ready-for-human-signoff`. YAML parsing passed; real Stash execution is pending.

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
| Pending | Pending | Pending | `verification/manual-pack/stash.yaml` | Pending | not tested | Pending |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| YAML imports | No parser error | Pending | Pending | Screenshot |
| HTTP path | URL loads | Pending | Pending | Stash log |
| SOCKS5 path | URL loads | Pending | Pending | Stash log |
| Metrics increment | Counters increase | Pending | Pending | `/metrics` capture |
| Rollback | Profile disabled | Pending | Pending | Screenshot |
