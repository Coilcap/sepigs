import { isAbsolute, resolve } from "node:path";
import type { ExtensionType, PluginIsolationConfig, PluginModuleConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { createRemoteOutboundFactory } from "./rpc/host.js";
import { createLegacyManifest, loadPluginManifest, type PluginManifest } from "./manifest.js";
import { ChildProcessPluginRunner } from "./runners/childProcessRunner.js";
import { InProcessPluginRunner } from "./runners/inProcessRunner.js";
import { WorkerThreadPluginRunner } from "./runners/workerThreadRunner.js";
import type { PluginRunner, PluginRunnerEvents, SepigsPluginContext } from "./types.js";

interface LoadedPlugin {
  readonly tag: string;
  readonly manifest: PluginManifest;
  readonly runner: PluginRunner;
  readonly configKey: string;
}

export class PluginManager {
  private readonly logger: Logger;
  private readonly context: SepigsPluginContext;
  private readonly isolation: PluginIsolationConfig;
  private readonly loaded: LoadedPlugin[] = [];
  private readonly remoteOutboundTypes = new Map<string, Set<ExtensionType>>();
  private started = false;

  public constructor(logger: Logger, context: Omit<SepigsPluginContext, "logger">, isolation: PluginIsolationConfig) {
    this.logger = logger;
    this.isolation = isolation;
    this.context = {
      logger,
      ...context
    };
  }

  public async loadAll(configs: readonly PluginModuleConfig[]): Promise<void> {
    const desired = new Map(configs.filter((config) => config.enabled).map((config) => [config.tag, configKey(config)]));
    for (const loaded of [...this.loaded]) {
      if (desired.get(loaded.tag) !== loaded.configKey) {
        await loaded.runner.stop();
        this.unregisterRemoteOutboundFactories(loaded.tag);
        this.loaded.splice(this.loaded.indexOf(loaded), 1);
      }
    }
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
      await loaded.runner.start();
    }
    this.started = true;
  }

  public async stop(): Promise<void> {
    if (!this.started && this.loaded.length === 0) {
      return;
    }
    for (const loaded of [...this.loaded].reverse()) {
      await loaded.runner.stop();
      this.unregisterRemoteOutboundFactories(loaded.tag);
    }
    this.loaded.length = 0;
    this.started = false;
  }

  public listLoaded(): readonly string[] {
    return this.loaded.map((plugin) => plugin.tag);
  }

  private async loadOne(config: PluginModuleConfig): Promise<void> {
    const resolvedPath = isAbsolute(config.path) ? config.path : resolve(process.cwd(), config.path);
    const manifest = await this.resolveManifest(config, resolvedPath);
    const runner = this.createRunner(config, manifest);

    try {
      await runner.setup();
    } catch (error) {
      await runner.stop();
      throw error;
    }
    this.loaded.push({ tag: config.tag, manifest, runner, configKey: configKey(config) });
    if (this.started) {
      await runner.start();
    }
    this.logger.info("plugin module loaded", {
      tag: config.tag,
      name: manifest.name,
      isolation: this.isolation.mode,
      manifest: manifest.manifestPath,
      entry: manifest.entryPath
    });
  }

  private createRunner(config: PluginModuleConfig, manifest: PluginManifest): PluginRunner {
    const events: PluginRunnerEvents = {
      onRegisterOutboundFactory: (type, runner) => {
        this.registerRemoteOutboundFactory(type, runner);
      },
      onRunnerClosed: (runner) => {
        this.unregisterRemoteOutboundFactories(runner.tag);
      }
    };
    if (this.isolation.mode === "worker-thread") {
      return new WorkerThreadPluginRunner(config, manifest, this.isolation, events);
    }
    if (this.isolation.mode === "child-process") {
      return new ChildProcessPluginRunner(config, manifest, this.isolation, events);
    }
    const registerOwnedOutboundFactory: typeof this.context.registerOutboundFactory = (type, factory) => {
      this.context.registerOutboundFactory(type, factory, config.tag);
      const registered = this.remoteOutboundTypes.get(config.tag) ?? new Set<ExtensionType>();
      registered.add(type as ExtensionType);
      this.remoteOutboundTypes.set(config.tag, registered);
    };
    return new InProcessPluginRunner(config, manifest, { ...this.context, registerOutboundFactory: registerOwnedOutboundFactory });
  }

  private registerRemoteOutboundFactory(type: string, runner: PluginRunner): void {
    if (!type.startsWith("plugin.")) {
      this.logger.warn("remote plugin attempted to register non-plugin outbound type", { tag: runner.tag, type });
      return;
    }
    const extensionType = type as ExtensionType;
    this.context.registerOutboundFactory(extensionType, createRemoteOutboundFactory(extensionType, runner, this.isolation.timeoutMs), runner.tag);
    const registered = this.remoteOutboundTypes.get(runner.tag) ?? new Set<ExtensionType>();
    registered.add(extensionType);
    this.remoteOutboundTypes.set(runner.tag, registered);
    this.logger.info("remote plugin outbound factory registered", { tag: runner.tag, type });
  }

  private unregisterRemoteOutboundFactories(tag: string): void {
    const registered = this.remoteOutboundTypes.get(tag);
    if (registered === undefined) {
      return;
    }
    for (const type of registered) {
      this.context.unregisterOutboundFactory?.(type, tag);
    }
    this.remoteOutboundTypes.delete(tag);
    this.logger.info("remote plugin outbound factories unregistered", { tag, count: registered.size });
  }

  private async resolveManifest(config: PluginModuleConfig, resolvedPath: string): Promise<PluginManifest> {
    const manifestPath = config.manifest === undefined ? (resolvedPath.endsWith(".json") ? resolvedPath : undefined) : config.manifest;
    if (manifestPath === undefined) {
      this.logger.warn("plugin loaded without manifest; legacy full permissions applied", { tag: config.tag, path: resolvedPath });
      return createLegacyManifest(config.tag, resolvedPath);
    }
    const resolvedManifestPath = isAbsolute(manifestPath) ? manifestPath : resolve(process.cwd(), manifestPath);
    return await loadPluginManifest(resolvedManifestPath);
  }
}

const configKey = (config: PluginModuleConfig): string => JSON.stringify({ path: config.path, manifest: config.manifest, enabled: config.enabled });
