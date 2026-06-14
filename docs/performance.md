# Performance

sepigs keeps the hot TCP path small:

- HTTP/SOCKS inbounds parse only handshake metadata before stream piping.
- TCP relay uses `socket.pipe()` in both directions.
- Byte accounting is performed by lightweight `data` listeners.
- Route rules are compiled once during config load.
- Rule-set files are expanded before the router is constructed, so runtime routing does no file IO.

## Current Benchmark Data

From `bench/results/latest.md`:

| Target | Effective | Success | Mbps | p50 ms | p95 ms | RSS |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | 100 | 100/100 | 9.13 | 17.71 | 26.15 | 95.47 MiB |
| 500 | 128 | 500/500 | 20.16 | 21.46 | 25.00 | 105.41 MiB |
| 1000 | 128 | 1000/1000 | 26.83 | 17.56 | 19.14 | 124.34 MiB |
| 5000 | 128 | 5000/5000 | 34.88 | 14.44 | 15.85 | 139.44 MiB |

The default benchmark uses `--max-active 128` to avoid exhausting local file descriptors. On production-like hosts, raise `--max-active` after increasing `ulimit -n`.

## Observed Bottlenecks

- High target levels are limited by local file-descriptor safety cap, not by sepigs route logic.
- RSS rises during high connection churn and should be watched over repeated soak runs.
- p95 latency stayed below 27ms in the local benchmark, with no failed or rejected connections.

## Profiling Guidance

Use `npm run benchmark` for a quick profile report. For deeper CPU data:

```sh
node --cpu-prof ./node_modules/.bin/tsx bench/benchmark.ts --max-active 512
```

For memory investigation, compare `heapUsedAfterBytes` and `rssAfterBytes` in repeated `bench/results/latest.json` reports.
