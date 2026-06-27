# Clash Verge Acceptance

Status: `verified`. The user manually confirmed all Clash Verge acceptance
checks passed. Device, OS, app/core version, screenshots, and detailed logs were
not supplied and remain `unknown`.

## Configuration And Import

1. Replace the `SEPIGS_*` values in `verification/manual-pack/mihomo.yaml`.
2. Import it into Clash Verge, select `SEPIGS`, and enable system proxy.
3. Open `https://example.com/` and inspect both Clash Verge logs and sepigs metrics.
4. Disable system proxy and remove the profile to roll back.

Expected result: HTTP 200 through the selected sepigs SOCKS5 endpoint and direct networking restored after rollback.

## Execution Record

| Device | OS version | App/core version | Config | Tester/time | Result | Failure log or screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| unknown | unknown | unknown | `verification/manual-pack/mihomo.yaml` | User manual signoff / 2026-06-28 CST | verified | unknown |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Import | No syntax error | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Request | URL loads | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Metrics | Counter increases | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
| Rollback | System proxy disabled | Pass reported by user | Yes | User manual signoff; detailed log not supplied |
