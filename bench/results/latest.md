# sepigs Benchmark Report

Generated: 2026-06-23T12:07:02.732Z

| Target | Effective | Success | Mbps | p50 ms | p95 ms | p99 ms | RSS | Heap Used | CPU ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 100/100 | 8.08 | 22.27 | 31.84 | 32.08 | 101.55 MiB | 17.39 MiB | 62.77 |
| 500 | 128 | 500/500 | 17.00 | 25.53 | 30.16 | 30.70 | 112.03 MiB | 17.90 MiB | 168.14 |
| 1000 | 128 | 1000/1000 | 23.48 | 19.84 | 23.77 | 23.92 | 130.11 MiB | 24.72 MiB | 295.29 |
| 5000 | 128 | 5000/5000 | 31.38 | 15.77 | 19.50 | 21.57 | 149.83 MiB | 15.80 MiB | 771.36 |

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

- highest p95 latency at target 100: 31.84ms
- local file-descriptor safety cap limited effective concurrency for high target levels

## Recommendations

- run with a higher --max-active value on hosts with a higher ulimit -n to validate true 5000 simultaneous sockets
- compare rssAfterBytes and heapUsedAfterBytes over repeated runs to detect growth trends
- profile with node --cpu-prof when p95 latency grows faster than throughput
- current benchmark completed without failed requests
