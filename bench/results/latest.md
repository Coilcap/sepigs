# sepigs Benchmark Report

Generated: 2026-06-21T23:11:26.684Z

| Target | Effective | Success | Mbps | p50 ms | p95 ms | p99 ms | RSS | Heap Used | CPU ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 100/100 | 8.45 | 20.23 | 29.97 | 30.21 | 97.80 MiB | 14.85 MiB | 62.23 |
| 500 | 128 | 500/500 | 15.80 | 23.73 | 46.52 | 47.71 | 108.02 MiB | 20.62 MiB | 166.74 |
| 1000 | 128 | 1000/1000 | 23.43 | 19.83 | 26.09 | 27.72 | 127.33 MiB | 26.03 MiB | 287.12 |
| 5000 | 128 | 5000/5000 | 32.06 | 15.23 | 20.05 | 22.89 | 145.09 MiB | 20.31 MiB | 762.96 |

## Connection Data

- Total connections: 6600
- Active connections after stop: 0
- Failed connections: 0
- Rejected connections: 0
- Average connection duration: 1.26ms

## Leak Snapshot

- Active sockets: 0
- Active timers: 0
- Active listeners: 0

## Bottlenecks

- highest p95 latency at target 500: 46.52ms
- local file-descriptor safety cap limited effective concurrency for high target levels

## Recommendations

- run with a higher --max-active value on hosts with a higher ulimit -n to validate true 5000 simultaneous sockets
- compare rssAfterBytes and heapUsedAfterBytes over repeated runs to detect growth trends
- profile with node --cpu-prof when p95 latency grows faster than throughput
- current benchmark completed without failed requests
