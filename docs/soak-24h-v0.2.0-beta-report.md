# Full Soak Report

- profile: 24h
- durationMs: 86400000
- elapsedMs: 86400000
- concurrency: 128
- completed: true
- interrupted: false
- totalRequests: 14645616
- success: 14645605
- errors: 11
- errorReasons: {"read ECONNRESET":6,"socket closed":5}
- successRate: 0.9999992489219982
- bytes: 566415550
- latencyP50Ms: 2.54
- latencyP95Ms: 7.82
- latencyP99Ms: 14.53
- eventLoopP95Ms: 22.13
- gcCount: 6555
- gcTotalDurationMs: 19846.49
- reloadCount: 17303
- infrastructurePauses: 67
- suspendedMs: 57751794
- failoverCount: 885789
- latest: rss=163.16MiB heap=49.06MiB sockets=0 timers=1 listeners=0 fd=20
- final: rss=176.23MiB heap=53.62MiB sockets=0 timers=0 listeners=0 fd=18

Artifacts:

- `checkpoint.json`
- `metrics.jsonl`
- `failures.jsonl`
- `connections-final.json`
