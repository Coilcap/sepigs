# Reload Dry-Run Plan

- Generated: 2026-07-03T01:19:02.386Z
- Current config: `examples/sepigs.json`
- Candidate config: `examples/sepigs.safe.json`
- Current hash: `eae5f653cec03a46c1ab87e190ad5412bea9a0311df0b57550a3052b2757dede`
- Candidate hash: `e4b040605dbed8ab75fddccacc2088180d50a3fdd82bcd9be92c8a895d531c29`
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
