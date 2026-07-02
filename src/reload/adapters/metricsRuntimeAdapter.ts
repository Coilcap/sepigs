import type { MetricsServerConfig, SepigsConfig } from "../../config/types.js";
import { PrometheusMetricsServer } from "../../observability/prometheus.js";
import type {
  PreparedComponent,
  ReloadableComponent,
  ReloadOperationContext
} from "../contract.js";
import { probeTcpPort } from "./runtimePortProbe.js";

export interface MetricsRuntimeHost {
  currentMetricsServer(): PrometheusMetricsServer;
  createMetricsServer(config: MetricsServerConfig): PrometheusMetricsServer;
  replaceMetricsServer(server: PrometheusMetricsServer): void;
  runtimeStarted(): boolean;
}

type MetricsReloadStrategy = "in-place" | "replace" | "disable";

interface MetricsRuntimePrepared {
  readonly oldServer: PrometheusMetricsServer;
  readonly oldConfig: MetricsServerConfig;
  readonly nextConfig: MetricsServerConfig;
  readonly candidateServer?: PrometheusMetricsServer;
  readonly strategy: MetricsReloadStrategy;
  candidateStarted: boolean;
  oldStopped: boolean;
  hostSwapped: boolean;
  committed: boolean;
  rolledBack: boolean;
}

export class MetricsRuntimeAdapter implements ReloadableComponent<MetricsRuntimePrepared> {
  public readonly name = "metrics-server" as const;

  public constructor(private readonly host: MetricsRuntimeHost) {}

  public currentGeneration(): string {
    return "runtime-control-plane";
  }

  public async prepare(
    config: SepigsConfig,
    context: ReloadOperationContext
  ): Promise<PreparedComponent<MetricsRuntimePrepared>> {
    const oldServer = this.host.currentMetricsServer();
    const oldConfig = oldServer.configuration();
    const nextConfig = config.observability.metrics;
    const strategy = selectMetricsStrategy(oldConfig, nextConfig);
    if (strategy === "replace" && nextConfig.enabled && this.host.runtimeStarted()) {
      await probeTcpPort(nextConfig.listen, nextConfig.port, context.signal);
    }
    const candidateServer = strategy === "replace"
      ? this.host.createMetricsServer(nextConfig)
      : undefined;
    return {
      component: this.name,
      candidateGenerationId: context.candidateGenerationId,
      preparedAt: Date.now(),
      value: {
        oldServer,
        oldConfig,
        nextConfig,
        ...(candidateServer === undefined ? {} : { candidateServer }),
        strategy,
        candidateStarted: false,
        oldStopped: false,
        hostSwapped: false,
        committed: false,
        rolledBack: false
      },
      resources: [],
      rollbackFailureStrategy: "keep-old-generation"
    };
  }

  public healthCheck(prepared: PreparedComponent<MetricsRuntimePrepared>): Promise<void> {
    if (prepared.value.strategy === "replace" && prepared.value.candidateServer === undefined) {
      return Promise.reject(new Error("metrics candidate server was not prepared"));
    }
    return Promise.resolve();
  }

  public async commit(prepared: PreparedComponent<MetricsRuntimePrepared>): Promise<void> {
    const state = prepared.value;
    try {
      if (state.strategy === "in-place") {
        state.oldServer.updateConfig(state.nextConfig);
      } else if (state.strategy === "disable") {
        if (this.host.runtimeStarted()) {
          await state.oldServer.stop();
          state.oldStopped = true;
        }
        const disabledServer = this.host.createMetricsServer(state.nextConfig);
        this.host.replaceMetricsServer(disabledServer);
        state.hostSwapped = true;
      } else {
        const candidate = requiredCandidate(state);
        if (this.host.runtimeStarted()) {
          await candidate.start();
          state.candidateStarted = true;
          await state.oldServer.stop();
          state.oldStopped = true;
        }
        this.host.replaceMetricsServer(candidate);
        state.hostSwapped = true;
      }
      state.committed = true;
    } catch (error) {
      await restoreMetricsState(this.host, state);
      throw error;
    }
  }

  public async rollback(prepared: PreparedComponent<MetricsRuntimePrepared>): Promise<void> {
    await restoreMetricsState(this.host, prepared.value);
    prepared.value.rolledBack = true;
    prepared.value.committed = false;
  }

  public async cleanup(prepared: PreparedComponent<MetricsRuntimePrepared>): Promise<void> {
    const state = prepared.value;
    if (state.strategy !== "replace" || state.candidateServer === undefined) return;
    if (state.committed && !state.rolledBack) return;
    await state.candidateServer.stop();
    state.candidateStarted = false;
  }
}

const selectMetricsStrategy = (
  oldConfig: MetricsServerConfig,
  nextConfig: MetricsServerConfig
): MetricsReloadStrategy => {
  if (!nextConfig.enabled) return "disable";
  if (
    oldConfig.enabled &&
    oldConfig.listen === nextConfig.listen &&
    oldConfig.port === nextConfig.port
  ) {
    return "in-place";
  }
  return "replace";
};

const requiredCandidate = (state: MetricsRuntimePrepared): PrometheusMetricsServer => {
  if (state.candidateServer === undefined) throw new Error("metrics candidate server is unavailable");
  return state.candidateServer;
};

const restoreMetricsState = async (
  host: MetricsRuntimeHost,
  state: MetricsRuntimePrepared
): Promise<void> => {
  if (state.strategy === "in-place") {
    state.oldServer.updateConfig(state.oldConfig);
    return;
  }
  if (state.hostSwapped) {
    host.replaceMetricsServer(state.oldServer);
    state.hostSwapped = false;
  }
  if (state.candidateServer !== undefined && state.candidateStarted) {
    await state.candidateServer.stop();
    state.candidateStarted = false;
  }
  if (state.oldStopped && host.runtimeStarted()) {
    await state.oldServer.start();
    state.oldStopped = false;
  }
};
