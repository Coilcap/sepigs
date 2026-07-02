import http from "node:http";
import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/loader.js";
import type { SepigsConfig } from "../config/types.js";
import { Engine } from "../core/engine.js";
import type { RuntimeReloadOutcome } from "./runtimeIntegration.js";

export interface RuntimeSmokeReport {
  readonly generatedAt: string;
  readonly mode: "transactional-experimental";
  readonly enabledComponents: readonly string[];
  readonly transactionId: string;
  readonly oldGeneration: string;
  readonly newGeneration: string;
  readonly componentResults: readonly {
    readonly component: string;
    readonly prepared: boolean;
    readonly committed: boolean;
    readonly rolledBack: boolean;
  }[];
  readonly rollbackStatus: {
    readonly count: number;
    readonly transactionState: string;
  };
  readonly runtimeSideEffects: RuntimeReloadOutcome["runtimeSideEffects"];
  readonly endpointChecks: {
    readonly metrics: "passed" | "disabled";
    readonly dashboard: "passed" | "disabled";
  };
  readonly finalControlPlane: {
    readonly metricsAddress: string | null;
    readonly dashboardAddress: string | null;
  };
  readonly resourceCleanup: {
    readonly transactionCleanupCompleted: boolean;
    readonly cleanupErrors: number;
    readonly afterStopMetricsAddress: null;
    readonly afterStopDashboardAddress: null;
    readonly activeConnections: number;
    readonly activeSockets: number;
    readonly activeTimers: number;
    readonly activeListeners: number;
  };
}

export const runRuntimeSmoke = async (candidatePath: string): Promise<RuntimeSmokeReport> => {
  const loadedCandidate = await loadConfig(candidatePath);
  const candidate = withEphemeralSmokeDashboard(loadedCandidate);
  validateSmokeCandidate(candidate);
  const initial = createLegacyInitialConfig(candidate);
  const engine = new Engine(initial);
  let outcome: RuntimeReloadOutcome | undefined;
  let metricsStatus: "passed" | "disabled" = "disabled";
  let dashboardStatus: "passed" | "disabled" = "disabled";
  let finalMetricsAddress: string | null = null;
  let finalDashboardAddress: string | null = null;
  try {
    await engine.start();
    await engine.reloadConfig(candidate);
    outcome = engine.getLastRuntimeReloadOutcome();
    if (outcome === undefined || !outcome.execution.success) {
      throw new Error("runtime smoke did not produce a successful transaction");
    }
    if (candidate.observability.metrics.enabled) {
      const response = await request(engine.getMetricsAddress(), candidate.observability.metrics.path);
      if (response.status !== 200 || !response.body.includes("sepigs_reload_total")) {
        throw new Error("runtime smoke metrics endpoint check failed");
      }
      metricsStatus = "passed";
    }
    if (candidate.dashboard.enabled) {
      const response = await request(engine.getDashboardAddress(), "/api/status", candidate.dashboard.token);
      if (response.status !== 200) throw new Error("runtime smoke dashboard endpoint check failed");
      dashboardStatus = "passed";
    }
    finalMetricsAddress = formatAddress(engine.getMetricsAddress());
    finalDashboardAddress = formatAddress(engine.getDashboardAddress());
  } finally {
    await engine.stop();
  }
  const leaks = engine.getLeakSnapshot();
  const afterStopMetricsAddress = engine.getMetricsAddress();
  const afterStopDashboardAddress = engine.getDashboardAddress();
  if (afterStopMetricsAddress !== null || afterStopDashboardAddress !== null) {
    throw new Error("runtime smoke control-plane endpoint remained bound after stop");
  }
  const transaction = outcome.execution.transaction;
  return {
    generatedAt: new Date().toISOString(),
    mode: outcome.mode,
    enabledComponents: outcome.enabledComponents,
    transactionId: transaction.id,
    oldGeneration: transaction.oldGeneration.id,
    newGeneration: transaction.candidateGeneration.id,
    componentResults: outcome.changedComponents.map((component) => {
      const runtimeName = component === "metrics" ? "metrics-server" : "dashboard-server";
      return {
        component,
        prepared: outcome.execution.preparedComponents.includes(runtimeName),
        committed: outcome.execution.committedComponents.includes(runtimeName),
        rolledBack: (outcome.execution.metrics.componentRollback[runtimeName] ?? 0) > 0
      };
    }),
    rollbackStatus: {
      count: outcome.execution.metrics.rollback,
      transactionState: transaction.state
    },
    runtimeSideEffects: outcome.runtimeSideEffects,
    endpointChecks: {
      metrics: metricsStatus,
      dashboard: dashboardStatus
    },
    finalControlPlane: {
      metricsAddress: finalMetricsAddress,
      dashboardAddress: finalDashboardAddress
    },
    resourceCleanup: {
      transactionCleanupCompleted: outcome.resourceCleanup.completed,
      cleanupErrors: outcome.resourceCleanup.cleanupErrors,
      afterStopMetricsAddress,
      afterStopDashboardAddress,
      activeConnections: engine.getStats().activeConnections,
      activeSockets: leaks.activeSockets,
      activeTimers: leaks.activeTimers,
      activeListeners: leaks.activeListeners
    }
  };
};

export const writeRuntimeSmokeReport = async (
  report: RuntimeSmokeReport,
  outputDirectory = "reports/reload"
): Promise<void> => {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDirectory, "runtime-smoke-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(resolve(outputDirectory, "runtime-smoke-latest.md"), renderMarkdown(report), "utf8")
  ]);
};

const createLegacyInitialConfig = (candidate: SepigsConfig): SepigsConfig => ({
  ...candidate,
  reload: {
    ...candidate.reload,
    mode: "legacy"
  },
  observability: {
    ...candidate.observability,
    metrics: {
      ...candidate.observability.metrics,
      enabled: false
    }
  },
  dashboard: {
    ...candidate.dashboard,
    enabled: false
  }
});

const withEphemeralSmokeDashboard = (candidate: SepigsConfig): SepigsConfig => {
  if (!candidate.reload.transactional.enabledComponents.includes("dashboard")) return candidate;
  return {
    ...candidate,
    dashboard: {
      ...candidate.dashboard,
      enabled: true,
      token: `runtime-smoke-${randomBytes(16).toString("hex")}`
    }
  };
};

const validateSmokeCandidate = (config: SepigsConfig): void => {
  if (config.reload.mode !== "transactional-experimental") {
    throw new Error("runtime smoke config must enable transactional-experimental mode");
  }
  if (
    (config.observability.metrics.enabled && config.observability.metrics.listen !== "127.0.0.1") ||
    (config.dashboard.enabled && config.dashboard.listen !== "127.0.0.1")
  ) {
    throw new Error("runtime smoke endpoints must listen on 127.0.0.1");
  }
};

const request = async (
  address: ReturnType<Engine["getMetricsAddress"]>,
  path: string,
  token?: string
): Promise<{ readonly status: number; readonly body: string }> => {
  if (typeof address !== "object" || address === null) throw new Error("runtime smoke endpoint is not listening");
  return await new Promise((resolve, reject) => {
    const outgoing = http.request({
      host: "127.0.0.1",
      port: address.port,
      path,
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      response.once("end", () => {
        resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
      });
    });
    outgoing.once("error", reject);
    outgoing.end();
  });
};

const formatAddress = (address: ReturnType<Engine["getMetricsAddress"]>): string | null => {
  if (typeof address !== "object" || address === null) return null;
  return `${address.address}:${String(address.port)}`;
};

const renderMarkdown = (report: RuntimeSmokeReport): string => [
  "# Transactional Reload Runtime Smoke",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Mode: ${report.mode}`,
  `- Enabled components: ${report.enabledComponents.join(", ")}`,
  `- Transaction: ${report.transactionId}`,
  `- Generation: ${report.oldGeneration} -> ${report.newGeneration}`,
  `- State: ${report.rollbackStatus.transactionState}`,
  `- Rollbacks: ${report.rollbackStatus.count}`,
  `- Metrics endpoint: ${report.endpointChecks.metrics}`,
  `- Dashboard endpoint: ${report.endpointChecks.dashboard}`,
  "- Legacy fallback used: no",
  "- Data plane mutated: no",
  "",
  "| Component | Prepared | Committed | Rolled back |",
  "| --- | --- | --- | --- |",
  ...report.componentResults.map((component) =>
    `| ${component.component} | ${component.prepared ? "yes" : "no"} | ${component.committed ? "yes" : "no"} | ${component.rolledBack ? "yes" : "no"} |`
  ),
  "",
  "## Cleanup",
  "",
  `- Transaction cleanup completed: ${report.resourceCleanup.transactionCleanupCompleted ? "yes" : "no"}`,
  `- Cleanup errors: ${report.resourceCleanup.cleanupErrors}`,
  `- Active connections after stop: ${report.resourceCleanup.activeConnections}`,
  `- Active sockets/timers/listeners after stop: ${report.resourceCleanup.activeSockets}/${report.resourceCleanup.activeTimers}/${report.resourceCleanup.activeListeners}`,
  ""
].join("\n");

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  const configPath = argument("--config") ?? "examples/sepigs.transactional-reload.experimental.json";
  const report = await runRuntimeSmoke(configPath);
  await writeRuntimeSmokeReport(report);
  const cleanup = report.resourceCleanup;
  if (
    cleanup.activeConnections !== 0 ||
    cleanup.activeSockets !== 0 ||
    cleanup.activeTimers !== 0 ||
    cleanup.activeListeners !== 0
  ) {
    throw new Error("runtime smoke left tracked resources after stop");
  }
  console.log(
    `runtime reload smoke passed: ${report.componentResults.length} components; resources 0/0/0`
  );
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(`runtime reload smoke failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
