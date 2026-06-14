import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { PluginModuleConfig } from "../config/types.js";
import { registerInboundFactory } from "../inbound/registry.js";
import type { Logger } from "../logger/logger.js";
import { registerOutboundFactory } from "../outbound/registry.js";
import { ConfigError } from "../utils/errors.js";
import type { WasmExtensionManager } from "./wasm.js";
import type { WorkerPool } from "../workers/workerPool.js";

export interface SepigsPluginContext {
  readonly logger: Logger;
  readonly workerPool: WorkerPool | undefined;
  readonly wasmExtensions: WasmExtensionManager;
  readonly registerInboundFactory: typeof registerInboundFactory;
  readonly registerOutboundFactory: typeof registerOutboundFactory;
}

export interface SepigsPlugin {
  readonly name?: string;
  setup?(context: SepigsPluginContext): unknown;
  start?(): unknown;
  stop?(): unknown;
}

type SepigsPluginFactory = (context: SepigsPluginContext) => SepigsPlugin | undefined | Promise<SepigsPlugin | undefined>;

interface LoadedPlugin {
  readonly tag: string;
  readonly plugin: SepigsPlugin;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isPlugin = (value: unknown): value is SepigsPlugin => {
  if (!isRecord(value)) {
    return false;
  }
  const setup = value.setup;
  const start = value.start;
  const stop = value.stop;
  return setup === undefined || typeof setup === "function"
    ? (start === undefined || typeof start === "function") && (stop === undefined || typeof stop === "function")
    : false;
};

const isPluginFactory = (value: unknown): value is SepigsPluginFactory => {
  return typeof value === "function";
};

export class PluginManager {
  private readonly logger: Logger;
  private readonly context: SepigsPluginContext;
  private readonly loaded: LoadedPlugin[] = [];
  private started = false;

  public constructor(logger: Logger, context: Omit<SepigsPluginContext, "logger">) {
    this.logger = logger;
    this.context = {
      logger,
      ...context
    };
  }

  public async loadAll(configs: readonly PluginModuleConfig[]): Promise<void> {
    for (const config of configs) {
      if (!config.enabled) {
        this.logger.debug("plugin module disabled", { tag: config.tag, path: config.path });
        continue;
      }
      if (this.loaded.some((loaded) => loaded.tag === config.tag)) {
        continue;
      }
      await this.loadOne(config);
    }
  }

  public async start(): Promise<void> {
    if (this.started) {
      return;
    }
    for (const loaded of this.loaded) {
      await loaded.plugin.start?.();
    }
    this.started = true;
  }

  public async stop(): Promise<void> {
    if (!this.started && this.loaded.length === 0) {
      return;
    }
    for (const loaded of [...this.loaded].reverse()) {
      await loaded.plugin.stop?.();
    }
    this.started = false;
  }

  public listLoaded(): readonly string[] {
    return this.loaded.map((plugin) => plugin.tag);
  }

  private async loadOne(config: PluginModuleConfig): Promise<void> {
    const resolvedPath = isAbsolute(config.path) ? config.path : resolve(process.cwd(), config.path);
    const moduleUrl = pathToFileURL(resolvedPath).href;
    const imported = (await import(moduleUrl)) as unknown;
    const plugin = await this.instantiatePlugin(imported, config);

    await plugin.setup?.(this.context);
    this.loaded.push({ tag: config.tag, plugin });
    this.logger.info("plugin module loaded", {
      tag: config.tag,
      name: plugin.name,
      path: resolvedPath
    });
  }

  private async instantiatePlugin(imported: unknown, config: PluginModuleConfig): Promise<SepigsPlugin> {
    const namespace = isRecord(imported) ? imported : {};
    const exported = namespace.default ?? namespace.plugin ?? imported;

    if (isPluginFactory(exported)) {
      const created = await exported(this.context);
      if (created === undefined) {
        return {};
      }
      if (isPlugin(created)) {
        return created;
      }
    }

    if (isPlugin(exported)) {
      return exported;
    }

    throw new ConfigError(`plugin "${config.tag}" must export a plugin object or a plugin factory`);
  }
}
