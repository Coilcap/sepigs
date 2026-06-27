# Shadowrocket Acceptance

Status: `verified`. The user manually confirmed all Shadowrocket acceptance
checks passed. Device, OS, Shadowrocket version, screenshots, and detailed logs
were not supplied and remain `unknown`.

## Configuration

- Type: SOCKS5
- Address: the LAN address of the sepigs host
- Port: `1080`
- Alternative HTTP proxy port: `8080`
- Authentication: empty for `examples/sepigs.safe.json`; use configured credentials for a public authenticated listener

## Import

1. Start sepigs on an address reachable by the test device. Do not expose it publicly without auth.
2. In Shadowrocket, add a SOCKS5 node using the values above.
3. Enable global routing for the acceptance test.
4. Disable and remove the node to roll back.

## Test URL

`https://example.com/`

## Expected Result

The URL loads, Shadowrocket shows traffic on the sepigs node, and sepigs metrics record the connection without authentication or outbound failures.

## Execution Record

| Device | OS version | Client version | Config | Tester/time | Result | Failure log or screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| unknown | unknown | unknown | `verification/manual-pack/shadowrocket.md` | User manual signoff / 2026-06-28 CST | verified | unknown |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Node saves | No validation error | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| SOCKS5 connection | URL loads | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Auth rejection test | Wrong credentials fail | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Metrics increment | Counters increase | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Rollback | VPN/profile disabled | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
