# sepigs Benchmark Report

Generated: 2026-06-22T22:11:08.826Z

| Target | Effective | Success | Mbps | p50 ms | p95 ms | p99 ms | RSS | Heap Used | CPU ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 100/100 | 9.52 | 17.47 | 25.12 | 25.30 | 97.05 MiB | 15.25 MiB | 54.02 |
| 500 | 128 | 500/500 | 17.82 | 23.08 | 34.37 | 34.53 | 110.63 MiB | 17.26 MiB | 163.51 |
| 1000 | 128 | 1000/1000 | 23.44 | 20.51 | 24.67 | 25.18 | 127.64 MiB | 21.99 MiB | 295.88 |
| 5000 | 128 | 5000/5000 | 34.65 | 14.37 | 16.96 | 22.22 | 145.33 MiB | 27.98 MiB | 707.67 |

## Connection Data

- Total connections: 6600
- Active connections after stop: 0
- Failed connections: 0
- Rejected connections: 0
- Average connection duration: 1.43ms

## Leak Snapshot

- Active sockets: 0
- Active timers: 0
- Active listeners: 0

## Bottlenecks

- highest p95 latency at target 500: 34.37ms
- local file-descriptor safety cap limited effective concurrency for high target levels

## Recommendations

- run with a higher --max-active value on hosts with a higher ulimit -n to validate true 5000 simultaneous sockets
- compare rssAfterBytes and heapUsedAfterBytes over repeated runs to detect growth trends
- profile with node --cpu-prof when p95 latency grows faster than throughput
- current benchmark completed without failed requests
