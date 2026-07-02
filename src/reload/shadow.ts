import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/loader.js";
import { loadDryRunReloadPlan, type DryRunReloadPlan } from "./dryRun.js";
import { ReloadExecutor, type ReloadExecutionResult } from "./executor.js";
import { createReloadGeneration } from "./generation.js";
import { createDashboardReloadAdapter } from "./adapters/dashboardAdapter.js";
import { createDnsReloadAdapter } from "./adapters/dnsAdapter.js";
import { createFakeIpReloadAdapter } from "./adapters/fakeIpAdapter.js";
import { createInboundReloadAdapter } from "./adapters/inboundAdapter.js";
import { createMetricsReloadAdapter } from "./adapters/metricsAdapter.js";
import { createOutboundReloadAdapter } from "./adapters/outboundAdapter.js";
import { createPluginReloadAdapter } from "./adapters/pluginAdapter.js";
import { createProberReloadAdapter } from "./adapters/proberAdapter.js";
import { PrototypeReloadAdapter } from "./adapters/prototypeAdapter.js";
import { createRouterReloadAdapter } from "./adapters/routerAdapter.js";
import { createUdpReloadAdapter } from "./adapters/udpAdapter.js";
import type { ReloadComponentName } from "./types.js";

export interface ShadowReloadReport {
  readonly generatedAt: string;
  readonly mode: "shadow-prototype";
  readonly currentConfigPath: string;
  readonly candidateConfigPath: string;
  readonly plan: DryRunReloadPlan;
  readonly execution: ReloadExecutionResult;
  readonly adapterBoundaries: readonly {
    readonly component: ReloadComponentName;
    readonly capabilityBoundary: string;
  }[];
  readonly sideEffects: {
    readonly runtimeMutated: false;
    readonly listenersOpened: 0;
    readonly connectionsClosed: 0;
    readonly productionEngineInvoked: false;
  };
}

export interface ShadowReloadOptions {
  readonly candidatePath: string;
  readonly currentPath?: string;
  readonly timeoutMs?: number;
}

export const runShadowReload = async (options: ShadowReloadOptions): Promise<ShadowReloadReport> => {
  const currentPath = options.currentPath ?? "examples/sepigs.json";
  const [plan, candidateConfig] = await Promise.all([
    loadDryRunReloadPlan(options.candidatePath, currentPath),
    loadConfig(options.candidatePath)
  ]);
  const adapters = plan.changedComponents.map(createShadowAdapter);
  const oldGeneration = createReloadGeneration({
    id: `shadow-old-${plan.currentConfigHash.slice(0, 12)}`,
    configHash: plan.currentConfigHash,
    state: "active"
  });
  const candidateGeneration = createReloadGeneration({
    id: `shadow-candidate-${plan.candidateConfigHash.slice(0, 12)}`,
    configHash: plan.candidateConfigHash,
    parentGenerationId: oldGeneration.id
  });
  const execution = await new ReloadExecutor({
    transactionId: `shadow-${randomUUID()}`,
    oldGeneration,
    candidateGeneration,
    config: candidateConfig,
    components: adapters,
    timeoutMs: options.timeoutMs ?? 5_000,
    parse: async () => {
      await readFile(options.candidatePath, "utf8");
    },
    validate: async () => {
      await loadConfig(options.candidatePath);
    }
  }).execute();

  return {
    generatedAt: new Date().toISOString(),
    mode: "shadow-prototype",
    currentConfigPath: currentPath,
    candidateConfigPath: options.candidatePath,
    plan,
    execution,
    adapterBoundaries: adapters.map((adapter) => ({
      component: adapter.name,
      capabilityBoundary: adapter.capabilityBoundary
    })),
    sideEffects: {
      runtimeMutated: false,
      listenersOpened: 0,
      connectionsClosed: 0,
      productionEngineInvoked: false
    }
  };
};

export const writeShadowReloadReport = async (
  report: ShadowReloadReport,
  outputDirectory = "reports/reload"
): Promise<void> => {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(resolve(outputDirectory, "shadow-latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(resolve(outputDirectory, "shadow-latest.md"), renderMarkdown(report), "utf8")
  ]);
};

const createShadowAdapter = (component: ReloadComponentName): PrototypeReloadAdapter => {
  const factories: Partial<Record<ReloadComponentName, () => PrototypeReloadAdapter>> = {
    dns: createDnsReloadAdapter,
    "fake-ip-store": createFakeIpReloadAdapter,
    router: createRouterReloadAdapter,
    "policy-prober": createProberReloadAdapter,
    "outbound-registry": createOutboundReloadAdapter,
    "inbound-listeners": createInboundReloadAdapter,
    "dashboard-server": createDashboardReloadAdapter,
    "metrics-server": createMetricsReloadAdapter,
    "plugin-manager": createPluginReloadAdapter,
    "udp-session-manager": createUdpReloadAdapter
  };
  const factory = factories[component];
  if (factory !== undefined) return factory();
  return new PrototypeReloadAdapter(
    component,
    "No dedicated M4 adapter exists; shadow mode records the component without mutating its production owner."
  );
};

const renderMarkdown = (report: ShadowReloadReport): string => [
  "# Transactional Reload Shadow Report",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Result: ${report.execution.success ? "committed in shadow" : "failed in shadow"}`,
  `- Transaction state: ${report.execution.transaction.state}`,
  `- Changed components: ${report.plan.changedComponents.length === 0 ? "none" : report.plan.changedComponents.join(", ")}`,
  `- Prepared components: ${report.execution.preparedComponents.length}`,
  `- Committed components: ${report.execution.committedComponents.length}`,
  `- Rollbacks: ${report.execution.metrics.rollback}`,
  "- Runtime mutated: no",
  "- Production Engine invoked: no",
  `- Listeners opened: ${report.sideEffects.listenersOpened}`,
  `- Connections closed: ${report.sideEffects.connectionsClosed}`,
  "",
  "| Component | Prototype capability boundary |",
  "| --- | --- |",
  ...report.adapterBoundaries.map((adapter) =>
    `| ${adapter.component} | ${adapter.capabilityBoundary.replaceAll("|", "\\|")} |`
  ),
  "",
  "## Event Summary",
  "",
  ...report.execution.events.map((event) =>
    `- ${event.timestamp} \`${event.type}\`${event.component === undefined ? "" : ` (${event.component})`}`
  ),
  "",
  "This is an isolated prototype. A shadow commit does not publish a runtime generation.",
  ""
].join("\n");

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  const candidatePath = argument("--config") ?? "examples/sepigs.safe.json";
  const currentPath = argument("--current-config") ?? "examples/sepigs.json";
  const report = await runShadowReload({ candidatePath, currentPath });
  await writeShadowReloadReport(report);
  if (!report.execution.success) {
    throw new Error(report.execution.failureReason ?? "shadow reload failed");
  }
  console.log(
    `reload shadow passed: ${String(report.plan.changedComponents.length)} changed components; no runtime side effects`
  );
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(`reload shadow failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
