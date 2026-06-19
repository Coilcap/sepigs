# sepigs Benchmark Report

Generated: 2026-06-18T20:38:53.023Z

| Target | Effective | Success | Mbps | p50 ms | p95 ms | p99 ms | RSS | Heap Used | CPU ms |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 100/100 | 9.18 | 19.27 | 26.87 | 27.19 | 99.61 MiB | 11.79 MiB | 56.85 |
| 500 | 128 | 500/500 | 21.18 | 20.88 | 23.49 | 24.33 | 108.69 MiB | 17.70 MiB | 136.19 |
| 1000 | 128 | 1000/1000 | 27.02 | 17.25 | 20.29 | 20.64 | 127.80 MiB | 23.33 MiB | 256.06 |
| 5000 | 128 | 5000/5000 | 35.07 | 14.13 | 17.82 | 21.19 | 146.77 MiB | 19.05 MiB | 698.97 |

## Connection Data

- Total connections: 6600
- Active connections after stop: 0
- Failed connections: 0
- Rejected connections: 0
- Average connection duration: 1.23ms

## Leak Snapshot

- Active sockets: 0
- Active timers: 0
- Active listeners: 0

## Bottlenecks

- highest p95 latency at target 100: 26.87ms
- local file-descriptor safety cap limited effective concurrency for high target levels

## Recommendations

- run with a higher --max-active value on hosts with a higher ulimit -n to validate true 5000 simultaneous sockets
- compare rssAfterBytes and heapUsedAfterBytes over repeated runs to detect growth trends
- profile with node --cpu-prof when p95 latency grows faster than throughput
- current benchmark completed without failed requests
