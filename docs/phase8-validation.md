# Phase 8 Validation

Generated: 2026-06-22. Phase 8.5 closes the local-listen validation gap.

## EPERM Diagnosis

The minimal bind probe used `127.0.0.1`, port `0`, IPv4 only, and no port reuse. Inside the restricted filesystem/process sandbox it failed before any sepigs code ran:

```json
{"status":"blocked","host":"127.0.0.1","port":0,"code":"EPERM","syscall":"listen","message":"listen EPERM: operation not permitted 127.0.0.1"}
```

The identical probe outside the network sandbox succeeded and received ephemeral port `57022`. The root cause was the execution sandbox denying `listen(2)`, not a privileged port, IPv6 fallback, public address, port collision, reuse setting, or sepigs authentication/configuration.

Benchmark and soak tools now honor:

```bash
SEPIGS_TEST_HOST=127.0.0.1
SEPIGS_TEST_PORT=0
SEPIGS_DISABLE_IPV6=1
```

Only loopback hosts are accepted. Port `0` requests an OS-assigned ephemeral port. `npm run validation:no-listen` is available when all listening is prohibited, but it does not replace network benchmark or soak validation.

## Passed Gates

- `npm run lint`
- `npm run typecheck`
- `npm test`: 89 passed, 0 failed
- `npm run build`
- `npm run docs:check`: 59 Markdown files
- `npm run web:build`: output generated under ignored `dist/dashboard`
- `npm run sub:dry-run`: two nodes normalized, credentials redacted
- `npm run release:dry-run`: 493 files before final documentation refresh
- `npm run validation:no-listen`
- Environment-configured `npm run benchmark`
- Environment-configured `npm run soak:short`
- Environment-configured `npm run soak:matrix`

## Benchmark

All 6,600 connections succeeded with no failures, rejections, or retained tracked resources. The 5,000 target used the configured safety cap of 128 effective concurrent connections, reached 32.06 Mbps, p95 20.05 ms, and 145.09 MiB RSS. The highest p95 was 46.52 ms at the 500 target. Full data is in `bench/results/latest.md`.

## Ten-Minute Soak

- Duration: 600,000 ms
- Concurrency: 16
- Requests: 19,064/19,064 successful
- Errors: 0
- Latency: p50 2.81 ms, p95 4.59 ms, p99 6.22 ms
- Hot reloads: 120
- RSS range: 40.20 to 110.59 MiB
- Heap range: 11.04 to 32.15 MiB
- Final resources after stop: sockets 0, timers 0, listeners 0, file descriptors 23

The matrix verified 7/7 scenarios: long connection, high-concurrency short connections, sustained requests, hot reload during traffic, DNS fallback, outbound failover, and authentication success/failure.

## Remaining Boundaries

This validation does not claim true 5,000 simultaneous sockets because benchmark effective concurrency is capped at 128. It also does not replace a complete 24-hour soak or external Shadowsocks/Trojan client interoperability testing.
