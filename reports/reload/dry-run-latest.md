# Reload Dry-Run Plan

- Generated: 2026-07-04T17:48:27.010Z
- Current config: `examples/sepigs.json`
- Candidate config: `examples/sepigs.safe.json`
- Current hash: `a1575b54486a51257da3e9aad5fdd44b19d403d6f5a1315de2fb3ab1a9a66f84`
- Candidate hash: `85af07556cf84461232449584a49fca8e78ae2f0d1641a33a0cdbbb1c7e23466`
- Hash scope: run-local keyed HMAC; values are not comparable across runs
- Changed components: router, policy-prober, metrics-server
- Runtime mutated: no
- Listeners opened: 0
- Connections closed: 0

| Component | Changed | Planned action | Rollback | Prepare listener | Existing connections | Note |
| --- | --- | --- | --- | --- | --- | --- |
| dns | no | reuse | supported | no | no | Candidate resolver and caches must remain isolated until snapshot publication. |
| fake-ip-store | no | reuse | supported | no | no | Compatible stores may be reused; range or persistence changes require explicit mapping migration. |
| router | yes | atomic-snapshot | supported | no | no | New requests use the published router snapshot; established streams keep their route. |
| policy-prober | yes | stage-and-swap | supported | no | no | Health and backoff migration must be keyed by unchanged outbound tags. |
| outbound-registry | no | reuse | supported | no | no | Existing streams retain their outbound object; only new selection switches generation. |
| inbound-listeners | no | reuse | supported | no | no | Changed listeners prepare before old listeners drain; same-address replacement needs a bounded gap strategy. |
| dashboard-server | no | reuse | supported | no | no | Token and listener changes must not expose the old or new control plane without authentication. |
| metrics-server | yes | restart-listener | best-effort | yes | no | A port conflict must leave the previous metrics endpoint available. |
| plugin-manager | no | reuse | supported | no | no | Plugin setup and owner-scoped factories need isolated staging; irreversible plugin side effects require restart. |
| connection-manager | no | reuse | supported | no | no | The current limiter and timeout ownership are immutable; runtime mutation is outside M3. |
| udp-session-manager | no | reuse | supported | no | no | Existing UDP sessions retain their manager and timers; limit changes require a later generation-aware implementation. |

This report performs file loading, parsing, schema validation, hashing, and planning only.
