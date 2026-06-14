# sepigs Benchmark Report

Generated: 2026-06-14T19:40:44.810Z

| Target | Effective | Success | Mbps | p50 ms | p95 ms | p99 ms | RSS | Heap Used | CPU ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 100/100 | 9.33 | 17.46 | 26.03 | 26.16 | 98.42 MiB | 12.71 MiB | 48.02 |
| 500 | 128 | 500/500 | 19.37 | 23.39 | 25.58 | 25.95 | 108.28 MiB | 16.26 MiB | 154.25 |
| 1000 | 128 | 1000/1000 | 25.78 | 17.52 | 23.14 | 23.46 | 126.80 MiB | 28.18 MiB | 258.27 |
| 5000 | 128 | 5000/5000 | 32.99 | 15.11 | 16.87 | 25.77 | 144.08 MiB | 22.42 MiB | 731.30 |

## Connection Data

- Total connections: 6600
- Active connections after stop: 0
- Failed connections: 0
- Rejected connections: 0
- Average connection duration: 1.19ms

## Leak Snapshot

- Active sockets: 0
- Active timers: 0
- Active listeners: 0

## Bottlenecks

- highest p95 latency at target 100: 26.03ms
- local file-descriptor safety cap limited effective concurrency for high target levels

## Recommendations

- run with a higher --max-active value on hosts with a higher ulimit -n to validate true 5000 simultaneous sockets
- compare rssAfterBytes and heapUsedAfterBytes over repeated runs to detect growth trends
- profile with node --cpu-prof when p95 latency grows faster than throughput
- current benchmark completed without failed requests
