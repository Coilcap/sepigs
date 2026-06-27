# Chrome And System Proxy Acceptance

Status: `verified`. The user manually confirmed all Chrome/macOS system-proxy
acceptance checks passed. Device, OS, Chrome version, screenshots, and detailed
logs for that manual run were not supplied and remain `unknown`.

## Configuration And Import

1. Start sepigs with `examples/sepigs.safe.json`.
2. Set the OS HTTP proxy to `127.0.0.1:8080` or SOCKS5 proxy to `127.0.0.1:1080`.
3. Open `https://example.com/` in Chrome and confirm sepigs metrics increment.
4. Restore the system proxy to direct/automatic mode to roll back.

Expected result: HTTP 200, a matching sepigs connection, no authentication failure, and direct networking restored after rollback.

## Execution Record

| Device | OS version | Chrome version | Config | Tester/time | Result | Failure log or screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| unknown | unknown | unknown | unknown | User manual signoff / 2026-06-28 CST | verified | unknown |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| HTTP proxy | URL loads | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| SOCKS5 proxy | URL loads | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| DNS | Hostname resolves through proxy path | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| macOS system proxy | Existing Chrome uses scoped OS proxy | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Authentication | Correct credentials pass and wrong credentials fail | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Disconnect/reconnect | Client recovers after proxy restart | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Rollback | Original proxy state restored | Pass reported by user | Yes | User manual signoff; detailed log not supplied |

## Evidence Notes

- Preflight curl passed HTTP CONNECT, SOCKS5, Cloudflare trace, and httpbin IP
  requests with four accepted connections and zero outbound failures.
- Ephemeral local DOM proofs were generated for both Chrome HTTP and SOCKS5
  paths; they are not part of the release artifacts.
- The Chrome processes needed explicit termination after writing their DOM
  proof because Chrome updater helpers kept the headless parent alive. No test
  proxy process remained afterward.
- The agent-operated system-proxy attempt was inconclusive while Shadowrocket
  owned the primary route. It is retained as diagnostic context and is not the
  basis for the final verified status; the final status comes from the user's
  later manual signoff.
