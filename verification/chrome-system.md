# Chrome And System Proxy Acceptance

Status: `not tested`. Sign-off readiness: `ready-for-human-signoff`. Automated curl covers the protocol path but is not a Chrome/system-settings signature.

Phase 11 check: verification pack present; no Chrome/system-proxy human sign-off was executed in this environment.

## Configuration And Import

1. Start sepigs with `examples/sepigs.safe.json`.
2. Set the OS HTTP proxy to `127.0.0.1:8080` or SOCKS5 proxy to `127.0.0.1:1080`.
3. Open `https://example.com/` in Chrome and confirm sepigs metrics increment.
4. Restore the system proxy to direct/automatic mode to roll back.

Expected result: HTTP 200, a matching sepigs connection, no authentication failure, and direct networking restored after rollback.

## Execution Record

| Device | OS version | Chrome version | Config | Tester/time | Result | Failure log or screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| Pending desktop | Pending | Pending | `examples/clients/chrome-system.md` | Pending | not tested | Pending |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| HTTP proxy | URL loads | Pending | Pending | Chrome/network log |
| SOCKS5 proxy | URL loads | Pending | Pending | Chrome/network log |
| Metrics | Counter increases | Pending | Pending | `/metrics` capture |
| Rollback | Direct traffic restored | Pending | Pending | Screenshot |
