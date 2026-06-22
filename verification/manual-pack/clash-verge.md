# Clash Verge

1. Replace the `SEPIGS_*` values in `mihomo.yaml` (`SEPIGS_HOST` may be `127.0.0.1` on the same computer), then import it.
2. Select `SEPIGS`, enable system proxy, and open `https://example.com/`.
3. Success: request appears in sepigs and the page loads without a direct fallback.
4. Failure checks: ports 7890/1080, another system proxy, Mihomo core logs, and sepigs listener/auth settings. Roll back by disabling system proxy.

| OS | App/core version | Import | Request | Rollback | Result | Notes |
| --- | --- | --- | --- | --- | --- | --- |
|  |  | pending | pending | pending | pending |  |
