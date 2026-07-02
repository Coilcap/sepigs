# Reload Metrics Prototype

Status: M4 in-memory prototype only. It is not registered with the production
Prometheus endpoint or Dashboard.

`ReloadMetrics` records:

- total, successful, failed, and rolled-back transactions;
- per-component prepare and commit durations;
- per-component rollback counts;
- the current committed generation ID;
- the last primary failure reason.

The active generation advances only after the executor reaches `committed`.
Rollback and cleanup failures do not overwrite the primary transaction error.
Snapshots are JSON serializable and use component names as the only dynamic
dimension.

The collector is intentionally transaction-local. It has no timers,
listeners, sockets, global registration, metric labels containing transaction
IDs, or persistence. M5 must define bounded aggregation and fixed Prometheus
labels before runtime integration.
