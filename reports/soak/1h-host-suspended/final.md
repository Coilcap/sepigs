# Full Soak Report

- profile: 1h
- durationMs: 3600000
- elapsedMs: 3600000
- concurrency: 64
- completed: true
- interrupted: false
- totalRequests: 380272
- success: 380264
- errors: 8
- errorReasons: {"read timeout":8}
- successRate: 0.9999789624268944
- bytes: 14703394
- latencyP50Ms: 3.43
- latencyP95Ms: 7.93
- latencyP99Ms: 11.94
- eventLoopP95Ms: 22.07
- gcCount: 2435
- gcTotalDurationMs: 1021604.32
- reloadCount: 599
- failoverCount: 95233
- latest: rss=113.39MiB heap=16.41MiB sockets=0 timers=1 listeners=0 fd=25
- final: rss=126.02MiB heap=22.22MiB sockets=0 timers=0 listeners=0 fd=23

Artifacts:

- `checkpoint.json`
- `metrics.jsonl`
- `failures.jsonl`
- `connections-final.json`
