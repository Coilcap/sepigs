import type { LeakDetectorSnapshot } from "../core/leakDetector.js";
import type { StatsSnapshot } from "../core/stats.js";
import type { EventLoopDelaySnapshot } from "./eventLoop.js";
import type { GcSnapshot } from "./gc.js";
import type { ReloadMetricsSnapshot } from "../reload/metrics.js";
import type { DNSGenerationStoreMetrics } from "../dns/generationStore.js";

export interface MetricsSnapshot {
  readonly stats: StatsSnapshot;
  readonly leaks: LeakDetectorSnapshot;
  readonly eventLoop: EventLoopDelaySnapshot;
  readonly gc: GcSnapshot;
  readonly memory: NodeJS.MemoryUsage;
  readonly reload?: ReloadMetricsSnapshot;
  readonly routingGenerations?: {
    readonly router: number;
    readonly policy: number;
  };
  readonly dnsGenerations?: DNSGenerationStoreMetrics;
}

const metric = (name: string, value: number, help: string): string => {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} gauge`, `${name} ${Number.isFinite(value) ? value : 0}`].join("\n");
};

const counter = (name: string, value: number, help: string): string => {
  return [`# HELP ${name} ${help}`, `# TYPE ${name} counter`, `${name} ${Number.isFinite(value) ? value : 0}`].join("\n");
};

export const renderPrometheusMetrics = (snapshot: MetricsSnapshot): string => {
  const {
    stats,
    leaks,
    eventLoop,
    gc,
    memory,
    reload,
    routingGenerations,
    dnsGenerations
  } = snapshot;
  const metrics = [
    metric("sepigs_uptime_seconds", stats.uptimeMs / 1_000, "Sepigs process uptime in seconds."),
    counter("sepigs_connections_total", stats.totalConnections, "Total accepted connections."),
    metric("sepigs_connections_active", stats.activeConnections, "Currently active connections."),
    counter("sepigs_connections_failed_total", stats.failedConnections, "Connections closed as failed."),
    counter("sepigs_bytes_upload_total", stats.bytesClientToRemote + stats.udpBytesClientToRemote, "Total uploaded bytes."),
    counter("sepigs_bytes_download_total", stats.bytesRemoteToClient + stats.udpBytesRemoteToClient, "Total downloaded bytes."),
    counter("sepigs_udp_sessions_total", stats.udpSessionsTotal ?? 0, "Total accepted UDP sessions."),
    metric("sepigs_udp_sessions_active", stats.udpSessionsActive ?? 0, "Currently active UDP sessions."),
    counter("sepigs_udp_packets_upload_total", stats.udpPacketsClientToRemote, "UDP packets sent by clients."),
    counter("sepigs_udp_packets_download_total", stats.udpPacketsRemoteToClient, "UDP packets returned to clients."),
    counter("sepigs_udp_errors_total", stats.udpErrorsTotal ?? 0, "UDP session and forwarding errors."),
    counter("sepigs_route_matches_total", stats.routeMatchesTotal, "Total route match attempts."),
    counter("sepigs_outbound_failures_total", stats.outboundFailuresTotal, "Total outbound candidate failures."),
    counter("sepigs_dns_queries_total", stats.dnsQueriesTotal, "Total DNS queries."),
    counter("sepigs_dns_failures_total", stats.dnsFailuresTotal, "Total DNS failures."),
    counter("sepigs_hot_reload_total", stats.hotReloadTotal, "Total hot reload attempts."),
    counter("sepigs_hot_reload_failures_total", stats.hotReloadFailuresTotal, "Total failed hot reload attempts."),
    counter("sepigs_fake_ip_assignments_total", stats.fakeIpAssignmentsTotal ?? 0, "Total fake-IP mappings allocated."),
    counter("sepigs_dashboard_requests_total", stats.dashboardRequestsTotal ?? 0, "Total Dashboard API requests."),
    counter("sepigs_dashboard_errors_total", stats.dashboardErrorsTotal ?? 0, "Failed or unauthorized Dashboard API requests."),
    metric("sepigs_event_loop_delay_ms", eventLoop.p95Ms, "Current event loop p95 delay in milliseconds."),
    metric("sepigs_heap_used_bytes", memory.heapUsed, "Current V8 heap used bytes."),
    metric("sepigs_rss_bytes", memory.rss, "Current RSS bytes."),
    metric("sepigs_active_sockets", leaks.activeSockets, "Tracked active sockets."),
    metric("sepigs_active_timers", leaks.activeTimers, "Tracked active timers."),
    metric("sepigs_active_listeners", leaks.activeListeners, "Tracked active event listeners."),
    counter("sepigs_gc_events_total", gc.count, "Observed GC events."),
    counter("sepigs_gc_duration_ms_total", gc.totalDurationMs, "Total observed GC duration in milliseconds.")
  ];
  if (reload !== undefined) metrics.push(...renderReloadMetrics(reload));
  if (routingGenerations !== undefined) {
    metrics.push(
      metric(
        "sepigs_reload_active_router_generation_id",
        routingGenerations.router,
        "Active experimental router generation sequence."
      ),
      metric(
        "sepigs_reload_active_policy_generation_id",
        routingGenerations.policy,
        "Active experimental policy generation sequence."
      )
    );
  }
  if (dnsGenerations !== undefined) {
    metrics.push(
      metric(
        "sepigs_reload_active_dns_generation_id",
        dnsGenerations.activeGeneration,
        "Active experimental DNS generation sequence."
      ),
      metric(
        "sepigs_reload_dns_generation_draining",
        dnsGenerations.drainingGenerations,
        "Draining experimental DNS generations."
      ),
      counter(
        "sepigs_reload_dns_cache_carry_over_total",
        dnsGenerations.cacheCarriedOver,
        "DNS cache entries copied into committed candidate generations."
      ),
      counter(
        "sepigs_reload_dns_cache_dropped_total",
        dnsGenerations.cacheDropped,
        "DNS cache entries dropped by reload carry-over policy."
      ),
      counter(
        "sepigs_reload_dns_rejected_fake_ip_change_total",
        dnsGenerations.rejectedFakeIpChanges,
        "DNS transactional reloads rejected because fake-IP configuration changed."
      )
    );
  }
  return metrics.join("\n\n") + "\n";
};

const renderReloadMetrics = (reload: ReloadMetricsSnapshot): readonly string[] => [
  counter("sepigs_reload_total", reload.total, "Transactional reload attempts."),
  counter("sepigs_reload_success_total", reload.success, "Successful transactional reloads."),
  counter("sepigs_reload_failure_total", reload.failure, "Failed transactional reloads."),
  counter("sepigs_reload_rollback_total", reload.rollback, "Transactional reload rollbacks."),
  metric(
    "sepigs_reload_duration_ms",
    reload.transactionDurations.at(-1) ?? 0,
    "Most recent transactional reload duration in milliseconds."
  ),
  componentGauge(
    "sepigs_reload_component_prepare_duration_ms",
    latestDurations(reload.prepareDurations),
    "Most recent component prepare duration in milliseconds."
  ),
  componentGauge(
    "sepigs_reload_component_commit_duration_ms",
    latestDurations(reload.commitDurations),
    "Most recent component commit duration in milliseconds."
  ),
  componentGauge(
    "sepigs_reload_component_rollback_total",
    componentRollbackValues(reload),
    "Component rollback count.",
    "counter"
  )
];

const componentRollbackValues = (
  reload: ReloadMetricsSnapshot
): readonly [string, number][] => {
  const values = new Map<string, number>(
    Object.entries(reload.componentRollback).map(([component, value]) => [
      component,
      value
    ])
  );
  for (const component of [
    "metrics-server",
    "dashboard-server",
    "router",
    "policy-prober",
    "dns"
  ]) {
    if (!values.has(component)) values.set(component, 0);
  }
  return [...values];
};

const latestDurations = (
  durations: ReloadMetricsSnapshot["prepareDurations"]
): readonly [string, number][] => {
  const latest = new Map<string, number>();
  for (const duration of durations) latest.set(duration.component, duration.durationMs);
  return [...latest];
};

const componentGauge = (
  name: string,
  values: readonly (readonly [string, number | undefined])[],
  help: string,
  type: "gauge" | "counter" = "gauge"
): string => {
  const rows = values.length === 0
    ? [`${name}{component="none"} 0`]
    : values.map(([component, value]) => `${name}{component="${component}"} ${value ?? 0}`);
  return [`# HELP ${name} ${help}`, `# TYPE ${name} ${type}`, ...rows].join("\n");
};
