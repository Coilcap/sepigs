# Prometheus Alerts

Alert rules live in [prometheus-alerts.yml](../examples/prometheus-alerts.yml).

## Rules

- `SepigsActiveConnectionsTooHigh`: active connections approach the limiter.
- `SepigsErrorRateTooHigh`: failed connection rate exceeds 5%.
- `SepigsDnsFailureRateTooHigh`: DNS failures exceed 10% of DNS queries.
- `SepigsHotReloadFailure`: any hot reload failure in the last 10 minutes.
- `SepigsEventLoopDelayTooHigh`: p95 event loop delay is above 100 ms.
- `SepigsMemoryRssTooHigh`: RSS exceeds 1 GiB.
- `SepigsOutboundFailureSpike`: outbound failures spike in 5 minutes.
- `SepigsNoMetricsScraped`: Prometheus cannot see `sepigs_uptime_seconds`.

## Validation

```bash
npm test -- test/alerts.test.ts
```

The test parses the YAML and checks that every `sepigs_*` metric used by an alert expression exists in the current metrics renderer.

## Prometheus Include

```yaml
rule_files:
  - examples/prometheus-alerts.yml
```

The sample dashboard is [grafana-dashboard.json](../examples/grafana-dashboard.json).
