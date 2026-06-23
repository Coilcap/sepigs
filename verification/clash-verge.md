# Clash Verge Acceptance

Status: `not tested`. Sign-off readiness: `ready-for-human-signoff`. Mihomo YAML syntax is parsed locally; the Clash Verge GUI was not available.

## Configuration And Import

1. Replace the `SEPIGS_*` values in `verification/manual-pack/mihomo.yaml`.
2. Import it into Clash Verge, select `SEPIGS`, and enable system proxy.
3. Open `https://example.com/` and inspect both Clash Verge logs and sepigs metrics.
4. Disable system proxy and remove the profile to roll back.

Expected result: HTTP 200 through the selected sepigs SOCKS5 endpoint and direct networking restored after rollback.

## Execution Record

| Device | OS version | App/core version | Config | Tester/time | Result | Failure log or screenshot |
| --- | --- | --- | --- | --- | --- | --- |
| Pending desktop | Pending | Pending | `verification/manual-pack/mihomo.yaml` | Pending | not tested | Pending |

## Acceptance

| Check | Expected | Actual | Pass | Evidence |
| --- | --- | --- | --- | --- |
| Import | No syntax error | Pending | Pending | Screenshot/log |
| Request | URL loads | Pending | Pending | Connection log |
| Metrics | Counter increases | Pending | Pending | `/metrics` capture |
| Rollback | System proxy disabled | Pending | Pending | Screenshot |
