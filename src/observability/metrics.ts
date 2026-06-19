import type { LeakDetectorSnapshot } from "../core/leakDetector.js";
import type { StatsSnapshot } from "../core/stats.js";
import type { EventLoopDelaySnapshot } from "./eventLoop.js";
import type { GcSnapshot } from "./gc.js";

export interface MetricsSnapshot {
  readonly stats: StatsSnapshot;
  readonly leaks: LeakDetectorSnapshot;
  readonly eventLoop: EventLoopDelaySnapshot;
  readonly gc: GcSnapshot;
  readonly memory: NodeJS.MemoryUsage;
}

const metric = (name: string, value: number, help: string): string => {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${Number.isFinite(value) ? value : 0}`].join("\n");
};

const counter = (name: string, value: number, help: string): string => {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} counter`, `${name} ${Number.isFinite(value) ? value : 0}`].join("\n");
};

export const renderPrometheusMetrics = (snapshot: MetricsSnapshot): string => {
  const { stats, leaks, eventLoop, gc, memory } = snapshot;
  return [
    metric("sepigs_uptime_seconds", stats.uptimeMs / 1_000, "Sepigs process uptime in seconds."),
    counter("sepigs_connections_total", stats.totalConnections, "Total accepted connections."),
    metric("sepigs_connections_active", stats.activeConnections, "Currently active connections."),
    counter("sepigs_connections_failed_total", stats.failedConnections, "Connections closed as failed."),
    counter("sepigs_bytes_upload_total", stats.bytesClientToRemote + stats.udpBytesClientToRemote, "Total uploaded bytes."),
    counter("sepigs_bytes_download_total", stats.bytesRemoteToClient + stats.udpBytesRemoteToClient, "Total downloaded bytes."),
    counter("sepigs_route_matches_total", stats.routeMatchesTotal, "Total route match attempts."),
    counter("sepigs_outbound_failures_total", stats.outboundFailuresTotal, "Total outbound candidate failures."),
    counter("sepigs_dns_queries_total", stats.dnsQueriesTotal, "Total DNS queries."),
    counter("sepigs_dns_failures_total", stats.dnsFailuresTotal, "Total DNS failures."),
    counter("sepigs_hot_reload_total", stats.hotReloadTotal, "Total hot reload attempts."),
    counter("sepigs_hot_reload_failures_total", stats.hotReloadFailuresTotal, "Total failed hot reload attempts."),
    metric("sepigs_event_loop_delay_ms", eventLoop.p95Ms, "Current event loop p95 delay in milliseconds."),
    metric("sepigs_heap_used_bytes", memory.heapUsed, "Current V8 heap used bytes."),
    metric("sepigs_rss_bytes", memory.rss, "Current RSS bytes."),
    metric("sepigs_active_sockets", leaks.activeSockets, "Tracked active sockets."),
    metric("sepigs_active_timers", leaks.activeTimers, "Tracked active timers."),
    metric("sepigs_active_listeners", leaks.activeListeners, "Tracked active event listeners."),
    counter("sepigs_gc_events_total", gc.count, "Observed GC events."),
    counter("sepigs_gc_duration_ms_total", gc.totalDurationMs, "Total observed GC duration in milliseconds.")
  ].join("\n\n") + "\n";
};
