# Shadowrocket Acceptance

Status: `not tested`. Sign-off readiness: `ready-for-human-signoff`. No iOS/Shadowrocket device was available to the agent.

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
| Pending iPhone/iPad | Pending | Pending | `verification/manual-pack/shadowrocket.md` | Pending | not tested | Pending |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Node saves | No validation error | Pending | Pending | Screenshot |
| SOCKS5 connection | URL loads | Pending | Pending | Connection log |
| Auth rejection test | Wrong credentials fail | Pending | Pending | Error screenshot |
| Metrics increment | Counters increase | Pending | Pending | `/metrics` capture |
| Rollback | VPN/profile disabled | Pending | Pending | Screenshot |
