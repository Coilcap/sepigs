import type { DashboardConfig, SepigsConfig } from "../../config/types.js";
import { DashboardServer } from "../../dashboard/server.js";
import type {
  PreparedComponent,
  ReloadableComponent,
  ReloadOperationContext
} from "../contract.js";
import { probeTcpPort } from "./runtimePortProbe.js";

export interface DashboardRuntimeHost {
  currentDashboardServer(): DashboardServer;
  createDashboardServer(config: DashboardConfig): DashboardServer;
  replaceDashboardServer(server: DashboardServer): void;
  runtimeStarted(): boolean;
}

type DashboardReloadStrategy = "in-place" | "replace" | "disable";

interface DashboardRuntimePrepared {
  readonly oldServer: DashboardServer;
  readonly oldConfig: DashboardConfig;
  readonly nextConfig: DashboardConfig;
  readonly candidateServer?: DashboardServer;
  readonly strategy: DashboardReloadStrategy;
  candidateStarted: boolean;
  oldStopped: boolean;
  hostSwapped: boolean;
  committed: boolean;
  rolledBack: boolean;
}

export class DashboardRuntimeAdapter implements ReloadableComponent<DashboardRuntimePrepared> {
  public readonly name = "dashboard-server" as const;

  public constructor(private readonly host: DashboardRuntimeHost) {}

  public currentGeneration(): string {
    return "runtime-control-plane";
  }

  public async prepare(
    config: SepigsConfig,
    context: ReloadOperationContext
  ): Promise<PreparedComponent<DashboardRuntimePrepared>> {
    const oldServer = this.host.currentDashboardServer();
    const oldConfig = oldServer.configuration();
    const nextConfig = config.dashboard;
    const strategy = selectDashboardStrategy(oldConfig, nextConfig);
    if (strategy === "replace" && nextConfig.enabled && this.host.runtimeStarted()) {
      await probeTcpPort(nextConfig.listen, nextConfig.port, context.signal);
    }
    const candidateServer = strategy === "replace"
      ? this.host.createDashboardServer(nextConfig)
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

  public healthCheck(prepared: PreparedComponent<DashboardRuntimePrepared>): Promise<void> {
    if (prepared.value.strategy === "replace" && prepared.value.candidateServer === undefined) {
      return Promise.reject(new Error("dashboard candidate server was not prepared"));
    }
    return Promise.resolve();
  }

  public async commit(prepared: PreparedComponent<DashboardRuntimePrepared>): Promise<void> {
    const state = prepared.value;
    try {
      if (state.strategy === "in-place") {
        state.oldServer.updateConfig(state.nextConfig);
      } else if (state.strategy === "disable") {
        if (this.host.runtimeStarted()) {
          await state.oldServer.stop();
          state.oldStopped = true;
        }
        const disabledServer = this.host.createDashboardServer(state.nextConfig);
        this.host.replaceDashboardServer(disabledServer);
        state.hostSwapped = true;
      } else {
        const candidate = requiredCandidate(state);
        if (this.host.runtimeStarted()) {
          await candidate.start();
          state.candidateStarted = true;
          await state.oldServer.stop();
          state.oldStopped = true;
        }
        this.host.replaceDashboardServer(candidate);
        state.hostSwapped = true;
      }
      state.committed = true;
    } catch (error) {
      await restoreDashboardState(this.host, state);
      throw error;
    }
  }

  public async rollback(prepared: PreparedComponent<DashboardRuntimePrepared>): Promise<void> {
    await restoreDashboardState(this.host, prepared.value);
    prepared.value.rolledBack = true;
    prepared.value.committed = false;
  }

  public async cleanup(prepared: PreparedComponent<DashboardRuntimePrepared>): Promise<void> {
    const state = prepared.value;
    if (state.strategy !== "replace" || state.candidateServer === undefined) return;
    if (state.committed && !state.rolledBack) return;
    await state.candidateServer.stop();
    state.candidateStarted = false;
  }
}

const selectDashboardStrategy = (
  oldConfig: DashboardConfig,
  nextConfig: DashboardConfig
): DashboardReloadStrategy => {
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

const requiredCandidate = (state: DashboardRuntimePrepared): DashboardServer => {
  if (state.candidateServer === undefined) throw new Error("dashboard candidate server is unavailable");
  return state.candidateServer;
};

const restoreDashboardState = async (
  host: DashboardRuntimeHost,
  state: DashboardRuntimePrepared
): Promise<void> => {
  if (state.strategy === "in-place") {
    state.oldServer.updateConfig(state.oldConfig);
    return;
  }
  if (state.hostSwapped) {
    host.replaceDashboardServer(state.oldServer);
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
