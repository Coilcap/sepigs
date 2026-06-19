import type { registerInboundFactory } from "../inbound/registry.js";
import type { Logger } from "../logger/logger.js";
import type { registerOutboundFactory, unregisterOutboundFactory } from "../outbound/registry.js";
import type { WorkerPool } from "../workers/workerPool.js";
import type { WasmExtensionManager } from "./wasm.js";

export interface SepigsPluginContext {
  readonly logger: Logger;
  readonly workerPool: WorkerPool | undefined;
  readonly wasmExtensions: WasmExtensionManager;
  readonly registerInboundFactory: typeof registerInboundFactory;
  readonly registerOutboundFactory: typeof registerOutboundFactory;
  readonly unregisterOutboundFactory?: typeof unregisterOutboundFactory;
}

export interface SepigsPlugin {
  readonly name?: string;
  setup?(context: SepigsPluginContext): unknown;
  start?(): unknown;
  stop?(): unknown;
  handle?(payload: unknown): unknown;
}

export type SepigsPluginFactory = (context: SepigsPluginContext) => SepigsPlugin | undefined | Promise<SepigsPlugin | undefined>;

export interface PluginRunner {
  readonly tag: string;
  setup(): Promise<void>;
  start(): Promise<void>;
  stop(): Promise<void>;
  invoke(payload: unknown): Promise<unknown>;
}

export interface PluginRunnerEvents {
  readonly onRegisterOutboundFactory?: (type: string, runner: PluginRunner) => void;
  readonly onRunnerClosed?: (runner: PluginRunner) => void;
}
