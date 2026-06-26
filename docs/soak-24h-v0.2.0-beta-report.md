# v0.2.0-beta.0 24-Hour Soak Status

- Status: `full-24h-pending`
- Phase 10 executed segment: `2h-segment-passed`
- Phase 11 status: `full-24h-not-completed-in-this-acceptance-run`
- Beta Signoff Sprint status: `running-in-screen`
- Screen session: `sepigs-24h`
- Run directory: `reports/soak/24h/`
- Resume command: `npm run soak:resume -- --profile 24h --duration-ms 86400000 --run-dir reports/soak/24h --docs-report docs/soak-24h-v0.2.0-beta-report.md`
- Evidence: 1,220,350/1,220,350 successful requests, 0 errors, 1,440 reloads, final sockets/timers/listeners 0/0/0.
- Resource trend: RSS samples 74.23-127.95 MiB; heap samples 15.74-41.51 MiB; final RSS/heap 90.73/36.50 MiB.
- Infrastructure pauses: 2 pauses, 1,030,454 ms excluded from effective runtime by the active clock.

The raw report below is a two-hour execution of the `24h` profile with `--duration-ms 7200000`; it is not a completed 24-hour pass. Phase 11 did not mark the 24-hour gate as passed because the full wall-clock run has not completed.

Beta Signoff Sprint started a fresh detached `screen` run with:

```bash
SEPIGS_TEST_HOST=127.0.0.1 SEPIGS_TEST_PORT=0 SEPIGS_DISABLE_IPV6=1 npm run soak:24h
```

Early checkpoint evidence from `reports/soak/24h/metrics.jsonl`:

- elapsed: about 420,881 ms
- success: 71,467
- errors: 0
- reloads: 84
- RSS samples: 172.85-203.69 MiB
- heap samples: 26.50-52.64 MiB

This is running evidence only, not a completed 24-hour pass.

# Full Soak Report

- profile: 24h
- durationMs: 7200000
- elapsedMs: 7200000
- concurrency: 128
- completed: true
- interrupted: false
- totalRequests: 1220350
- success: 1220350
- errors: 0
- errorReasons: {}
- successRate: 1
- bytes: 47198842
- latencyP50Ms: 4.50
- latencyP95Ms: 11.41
- latencyP99Ms: 17.36
- eventLoopP95Ms: 22.33
- gcCount: 7668
- gcTotalDurationMs: 12028.34
- reloadCount: 1440
- infrastructurePauses: 2
- suspendedMs: 1030454
- failoverCount: 305747
- latest: rss=74.23MiB heap=31.97MiB sockets=0 timers=1 listeners=0 fd=29
- final: rss=90.73MiB heap=36.50MiB sockets=0 timers=0 listeners=0 fd=27

Artifacts:

- `checkpoint.json`
- `metrics.jsonl`
- `failures.jsonl`
- `connections-final.json`
