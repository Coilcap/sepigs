# Benchmark

Run:

```sh
npm run benchmark
```

The benchmark starts:

- a local TCP echo server
- a local sepigs engine
- one HTTP inbound
- direct outbound routing

It then runs target levels:

- 100
- 500
- 1000
- 5000

The default active socket cap is 128. This keeps the benchmark repeatable on developer machines with low file descriptor limits while still creating the requested number of total connections.

## Options

```sh
npm run benchmark -- --levels 100,500,1000,5000 --max-active 256 --payload-bytes 256 --timeout-ms 2000
```

## Output

- `bench/results/latest.json`
- `bench/results/latest.md`

The report includes:

- target and effective concurrency
- success/failure counts
- throughput
- p50/p95/p99 latency
- CPU user/system time
- RSS and heap usage
- connection stats
- leak detector snapshot
- bottleneck analysis
- optimization recommendations
