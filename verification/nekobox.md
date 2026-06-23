# NekoBox Acceptance

Status: `not tested`. Sign-off readiness: `ready-for-human-signoff`. No real NekoBox client was available to the agent.

## Configuration

- Profile type: SOCKS5
- Server: `127.0.0.1` when NekoBox runs on the sepigs host, otherwise the host LAN address
- Port: `1080`
- Optional HTTP profile: port `8080`

## Import

1. Start sepigs with `examples/sepigs.safe.json` or an authenticated LAN configuration.
2. Create a SOCKS5 outbound/profile in NekoBox with the values above.
3. Start the profile and enable system proxy/VPN mode for the test.
4. Stop the profile and restore direct mode to roll back.

## Test URL

`https://example.com/`

## Expected Result

NekoBox reports a successful connection, the page loads, and sepigs connection/byte counters increase.

## Execution Record

| Device | OS version | Client version | Config | Tester/time | Result | Failure log or screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | `verification/manual-pack/nekobox.md` | Pending | not tested | Pending |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Profile saves | No validation error | Pending | Pending | Screenshot |
| Connection test | Successful | Pending | Pending | NekoBox log |
| URL request | HTTP 200 | Pending | Pending | Browser screenshot |
| Metrics increment | Counters increase | Pending | Pending | `/metrics` capture |
| Rollback | Direct mode restored | Pending | Pending | Screenshot |
