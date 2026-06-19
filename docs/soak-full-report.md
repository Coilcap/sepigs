# Full Soak Report

- profile: 1h
- durationMs: 3600000
- elapsedMs: 3600000
- concurrency: 64
- completed: true
- interrupted: false
- totalRequests: 456990
- success: 456990
- errors: 0
- errorReasons: {}
- successRate: 1
- bytes: 17672115
- latencyP50Ms: 3.55
- latencyP95Ms: 8.08
- latencyP99Ms: 11.33
- eventLoopP95Ms: 22.09
- gcCount: 2885
- gcTotalDurationMs: 3489.95
- reloadCount: 719
- infrastructurePauses: 0
- suspendedMs: 0
- failoverCount: 114468
- latest: rss=93.06MiB heap=26.01MiB sockets=0 timers=1 listeners=0 fd=25
- final: rss=105.19MiB heap=32.08MiB sockets=0 timers=0 listeners=0 fd=23

Artifacts:

- `checkpoint.json`
- `metrics.jsonl`
- `failures.jsonl`
- `connections-final.json`

## Host Suspension Incident

An earlier one-hour attempt was affected by an approximately 1,018 second host/event-loop suspension. Eight SOCKS5 reads timed out in the same millisecond window; the engine still stopped with zero tracked sockets, timers, and listeners. The evidence is preserved under `reports/soak/1h-host-suspended/`.

The runner was fixed to use an active-duration clock, exclude host suspension from effective soak time, and record `infrastructurePauses` / `suspendedMs`. A fault-injection test now covers this behavior. The clean rerun above completed 3,600,000 ms of active workload with zero errors and zero pauses.
