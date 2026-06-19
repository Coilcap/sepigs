import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import YAML from "yaml";
import type { LeakDetectorSnapshot } from "../src/core/leakDetector.js";
import type { StatsSnapshot } from "../src/core/stats.js";
import { renderPrometheusMetrics } from "../src/observability/metrics.js";

interface AlertRule {
  readonly alert: string;
  readonly expr: string;
}

interface AlertGroup {
  readonly name: string;
  readonly rules: readonly AlertRule[];
}

interface AlertFile {
  readonly groups: readonly AlertGroup[];
}

void test("Prometheus alert rules parse and reference exported metrics", async () => {
  const parsed = YAML.parse(await readFile("examples/prometheus-alerts.yml", "utf8")) as unknown;
  assert.ok(isAlertFile(parsed));
  const rules = parsed.groups.flatMap((group) => group.rules);
  assert.deepEqual(
    rules.map((rule) => rule.alert).sort(),
    [
      "SepigsActiveConnectionsTooHigh",
      "SepigsDnsFailureRateTooHigh",
      "SepigsErrorRateTooHigh",
      "SepigsEventLoopDelayTooHigh",
      "SepigsHotReloadFailure",
      "SepigsMemoryRssTooHigh",
      "SepigsNoMetricsScraped",
      "SepigsOutboundFailureSpike"
    ].sort()
  );

  const exportedMetrics = metricNames(renderPrometheusMetrics(metricsFixture()));
  for (const rule of rules) {
    for (const metricName of sepigsMetricNames(rule.expr)) {
      assert.ok(exportedMetrics.has(metricName), `${rule.alert} references missing metric ${metricName}`);
    }
  }
});

const isAlertFile = (value: unknown): value is AlertFile => {
  if (!isRecord(value) || !Array.isArray(value.groups)) {
    return false;
  }
  return value.groups.every((group) => {
    if (!isRecord(group) || typeof group.name !== "string" || !Array.isArray(group.rules)) {
      return false;
    }
    return group.rules.every((rule) => isRecord(rule) && typeof rule.alert === "string" && typeof rule.expr === "string");
  });
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const metricNames = (text: string): Set<string> => {
  const output = new Set<string>();
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || line.trim().length === 0) {
      continue;
    }
    const [name] = line.split(/\s+/u);
    if (name !== undefined && name.startsWith("sepigs_")) {
      output.add(name);
    }
  }
  return output;
};

const sepigsMetricNames = (expr: string): readonly string[] => {
  return [...expr.matchAll(/\bsepigs_[a-z0-9_]+\b/gu)].map((match) => match[0]);
};

const metricsFixture = (): Parameters<typeof renderPrometheusMetrics>[0] => {
  return {
    stats: statsFixture(),
    leaks: leaksFixture(),
    eventLoop: { p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 },
    gc: { count: 0, totalDurationMs: 0, maxDurationMs: 0 },
    memory: process.memoryUsage()
  };
};

const statsFixture = (): StatsSnapshot => ({
  activeConnections: 0,
  totalConnections: 0,
  failedConnections: 0,
  closedConnections: 0,
  rejectedConnections: 0,
  bytesClientToRemote: 0,
  bytesRemoteToClient: 0,
  totalBytes: 0,
  averageConnectionDurationMs: 0,
  failureRate: 0,
  uptimeMs: 0,
  udpPacketsClientToRemote: 0,
  udpPacketsRemoteToClient: 0,
  udpBytesClientToRemote: 0,
  udpBytesRemoteToClient: 0,
  routeMatchesTotal: 0,
  outboundFailuresTotal: 0,
  dnsQueriesTotal: 0,
  dnsFailuresTotal: 0,
  hotReloadTotal: 0,
  hotReloadFailuresTotal: 0
});

const leaksFixture = (): LeakDetectorSnapshot => ({
  activeSockets: 0,
  activeTimers: 0,
  activeListeners: 0,
  trackedEmitters: 0,
  warnings: []
});
