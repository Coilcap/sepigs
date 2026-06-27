# v2rayN Acceptance

Status: `verified`. The user manually confirmed all v2rayN acceptance checks
passed. Device, Windows version, v2rayN version, screenshots, and detailed logs
were not supplied and remain `unknown`.

## Configuration

- Server type: SOCKS
- Address: the sepigs host address
- Port: `1080`
- Alternative HTTP proxy: port `8080`
- Authentication: match the selected sepigs inbound configuration

## Import

1. Start sepigs and confirm Windows can reach its listener.
2. Add a custom SOCKS server in v2rayN using the values above.
3. Set it as the active server and enable system proxy.
4. Clear system proxy and restore the previous server to roll back.

## Test URL

`https://example.com/`

## Expected Result

v2rayN shows a successful request, the page returns HTTP 200, and sepigs metrics increase without failed authentication.

## Execution Record

| Device | OS version | Client version | Config | Tester/time | Result | Failure log or screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| unknown | unknown | unknown | `verification/manual-pack/v2rayn.md` | User manual signoff / 2026-06-28 CST | verified | unknown |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Server saves | No validation error | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| SOCKS connection | Successful | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| URL request | HTTP 200 | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Metrics increment | Counters increase | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Rollback | System proxy cleared | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
