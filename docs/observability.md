# Observability

sepigs exposes optional Prometheus text metrics.

```json
{
  "observability": {
    "metrics": {
      "enabled": true,
      "listen": "127.0.0.1",
      "port": 19090,
      "path": "/metrics"
    }
  }
}
```

The metrics server defaults to `127.0.0.1` and supports graceful shutdown. It does not expose proxy authentication secrets.

Key metrics:

- `sepigs_uptime_seconds`
- `sepigs_connections_total`
- `sepigs_connections_active`
- `sepigs_connections_failed_total`
- `sepigs_bytes_upload_total`
- `sepigs_bytes_download_total`
- `sepigs_route_matches_total`
- `sepigs_outbound_failures_total`
- `sepigs_dns_queries_total`
- `sepigs_dns_failures_total`
- `sepigs_hot_reload_total`
- `sepigs_hot_reload_failures_total`
- `sepigs_event_loop_delay_ms`
- `sepigs_heap_used_bytes`
- `sepigs_rss_bytes`
- `sepigs_active_sockets`
- `sepigs_active_timers`
- `sepigs_active_listeners`

Prometheus scrape example is in `examples/prometheus.yml`. Grafana starter JSON is in `examples/grafana-dashboard.json`.
