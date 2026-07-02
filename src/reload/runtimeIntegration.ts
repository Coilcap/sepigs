import type {
  SepigsConfig,
  TransactionalReloadComponent
} from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { ConfigError } from "../utils/errors.js";
import { DashboardRuntimeAdapter, type DashboardRuntimeHost } from "./adapters/dashboardRuntimeAdapter.js";
import { MetricsRuntimeAdapter, type MetricsRuntimeHost } from "./adapters/metricsRuntimeAdapter.js";
import { createDashboardReloadAdapter } from "./adapters/dashboardAdapter.js";
import { createMetricsReloadAdapter } from "./adapters/metricsAdapter.js";
import type { ReloadableComponent } from "./contract.js";
import { ReloadExecutor, type ReloadExecutionResult } from "./executor.js";
import { createReloadGeneration } from "./generation.js";
import { ReloadMetrics, type ReloadMetricsSnapshot } from "./metrics.js";

export interface RuntimeReloadHost extends MetricsRuntimeHost, DashboardRuntimeHost {
  commitRuntimeConfig(config: SepigsConfig): void;
}

export interface RuntimeReloadOutcome {
  readonly mode: "transactional-experimental";
  readonly enabledComponents: readonly TransactionalReloadComponent[];
  readonly changedComponents: readonly TransactionalReloadComponent[];
  readonly execution: ReloadExecutionResult;
  readonly shadowExecution?: ReloadExecutionResult;
  readonly runtimeSideEffects: {
    readonly dataPlaneMutated: false;
    readonly legacyFallbackUsed: false;
    readonly metricsChanged: boolean;
    readonly dashboardChanged: boolean;
  };
  readonly resourceCleanup: {
    readonly completed: boolean;
    readonly cleanupErrors: number;
  };
}

export class RuntimeReloadIntegration {
  private generation = 0;
  private lastOutcome: RuntimeReloadOutcome | undefined;

  public constructor(
    private readonly host: RuntimeReloadHost,
    private readonly metrics: ReloadMetrics,
    private readonly logger: Logger
  ) {}

  public async reload(previous: SepigsConfig, candidate: SepigsConfig): Promise<RuntimeReloadOutcome> {
    if (candidate.reload.mode !== "transactional-experimental") {
      throw new ConfigError("runtime transactional integration requires transactional-experimental mode");
    }
    assertControlPlaneOnlyChange(previous, candidate);
    const changedComponents = changedControlPlaneComponents(previous, candidate);
    const enabledComponents = new Set(candidate.reload.transactional.enabledComponents);
    for (const component of changedComponents) {
      if (!enabledComponents.has(component)) {
        throw new ConfigError(
          `transactional reload component "${component}" changed but is not enabled`
        );
      }
    }

    const nextGeneration = this.generation + 1;
    const oldGeneration = createReloadGeneration({
      id: `runtime-control-${String(this.generation)}`,
      configHash: `runtime-control-${String(this.generation)}`,
      state: "active"
    });
    const candidateGeneration = createReloadGeneration({
      id: `runtime-control-${String(nextGeneration)}`,
      configHash: `runtime-control-${String(nextGeneration)}`,
      parentGenerationId: oldGeneration.id
    });
    const transactionId = `runtime-reload-${String(Date.now())}-${String(nextGeneration)}`;
    let shadowExecution: ReloadExecutionResult | undefined;
    if (candidate.reload.transactional.shadowBeforeCommit) {
      shadowExecution = await new ReloadExecutor({
        transactionId: `${transactionId}-shadow`,
        oldGeneration,
        candidateGeneration,
        config: candidate,
        components: createShadowComponents(changedComponents),
        timeoutMs: candidate.reload.transactional.timeoutMs
      }).execute();
      if (!shadowExecution.success) {
        throw new ConfigError(
          `transactional reload shadow preflight failed: ${shadowExecution.failureReason ?? "unknown error"}`
        );
      }
    }

    const execution = await new ReloadExecutor({
      transactionId,
      oldGeneration,
      candidateGeneration,
      config: candidate,
      components: createRuntimeComponents(this.host, changedComponents),
      timeoutMs: candidate.reload.transactional.timeoutMs,
      metrics: this.metrics
    }).execute();
    const outcome: RuntimeReloadOutcome = {
      mode: "transactional-experimental",
      enabledComponents: [...candidate.reload.transactional.enabledComponents],
      changedComponents,
      execution,
      ...(shadowExecution === undefined ? {} : { shadowExecution }),
      runtimeSideEffects: {
        dataPlaneMutated: false,
        legacyFallbackUsed: false,
        metricsChanged: changedComponents.includes("metrics"),
        dashboardChanged: changedComponents.includes("dashboard")
      },
      resourceCleanup: {
        completed: execution.events.at(-1)?.type === "transaction.cleaned_up",
        cleanupErrors: execution.componentErrors.filter((error) => error.stage === "cleanup").length
      }
    };
    this.lastOutcome = outcome;
    if (!execution.success) {
      this.logger.warn("experimental transactional reload failed", {
        transactionId,
        failure: execution.failureReason ?? "unknown error",
        legacyFallbackUsed: false
      });
      throw new ConfigError(
        `experimental transactional reload failed: ${execution.failureReason ?? "unknown error"}`
      );
    }

    this.host.commitRuntimeConfig(candidate);
    this.generation = nextGeneration;
    this.logger.info("experimental transactional reload committed", {
      transactionId,
      components: changedComponents
    });
    return outcome;
  }

  public snapshot(): ReloadMetricsSnapshot {
    return this.metrics.snapshot();
  }

  public latestOutcome(): RuntimeReloadOutcome | undefined {
    return this.lastOutcome;
  }
}

const createRuntimeComponents = (
  host: RuntimeReloadHost,
  changed: readonly TransactionalReloadComponent[]
): readonly ReloadableComponent[] => {
  const components: ReloadableComponent[] = [];
  if (changed.includes("metrics")) components.push(new MetricsRuntimeAdapter(host));
  if (changed.includes("dashboard")) components.push(new DashboardRuntimeAdapter(host));
  return components;
};

const createShadowComponents = (
  changed: readonly TransactionalReloadComponent[]
): readonly ReloadableComponent[] => {
  const components: ReloadableComponent[] = [];
  if (changed.includes("metrics")) components.push(createMetricsReloadAdapter());
  if (changed.includes("dashboard")) components.push(createDashboardReloadAdapter());
  return components;
};

const changedControlPlaneComponents = (
  previous: SepigsConfig,
  candidate: SepigsConfig
): readonly TransactionalReloadComponent[] => {
  const changed: TransactionalReloadComponent[] = [];
  if (stableJson(previous.observability.metrics) !== stableJson(candidate.observability.metrics)) {
    changed.push("metrics");
  }
  if (stableJson(previous.dashboard) !== stableJson(candidate.dashboard)) {
    changed.push("dashboard");
  }
  return changed;
};

const assertControlPlaneOnlyChange = (previous: SepigsConfig, candidate: SepigsConfig): void => {
  if (stableJson(withoutControlPlane(previous)) !== stableJson(withoutControlPlane(candidate))) {
    throw new ConfigError(
      "transactional-experimental M5 only supports metrics/dashboard changes; use legacy mode for data-plane changes"
    );
  }
};

const withoutControlPlane = (config: SepigsConfig): unknown => {
  const {
    observability,
    dashboard,
    reload,
    ...dataPlane
  } = config;
  void observability;
  void dashboard;
  void reload;
  return dataPlane;
};

const stableJson = (value: unknown): string => JSON.stringify(sortValue(value));

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)])
  );
};
