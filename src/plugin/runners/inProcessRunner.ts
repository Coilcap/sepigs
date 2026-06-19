import { pathToFileURL } from "node:url";
import type { PluginModuleConfig } from "../../config/types.js";
import type { PluginManifest } from "../manifest.js";
import { createPluginSandbox } from "../sandbox.js";
import type { PluginRunner, SepigsPlugin, SepigsPluginContext, SepigsPluginFactory } from "../types.js";
import { ConfigError } from "../../utils/errors.js";

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
  const handle = value.handle;
  return (
    (setup === undefined || typeof setup === "function") &&
    (start === undefined || typeof start === "function") &&
    (stop === undefined || typeof stop === "function") &&
    (handle === undefined || typeof handle === "function")
  );
};

const isPluginFactory = (value: unknown): value is SepigsPluginFactory => {
  return typeof value === "function";
};

export class InProcessPluginRunner implements PluginRunner {
  public readonly tag: string;
  private readonly manifest: PluginManifest;
  private readonly config: PluginModuleConfig;
  private readonly context: SepigsPluginContext;
  private plugin: SepigsPlugin | undefined;

  public constructor(config: PluginModuleConfig, manifest: PluginManifest, context: SepigsPluginContext) {
    this.tag = config.tag;
    this.config = config;
    this.manifest = manifest;
    this.context = context;
  }

  public async setup(): Promise<void> {
    const moduleUrl = pathToFileURL(this.manifest.entryPath).href;
    const imported = (await import(moduleUrl)) as unknown;
    const pluginContext = createPluginSandbox(this.context, this.manifest);
    const plugin = await this.instantiatePlugin(imported, pluginContext);
    await plugin.setup?.(pluginContext);
    this.plugin = plugin;
  }

  public async start(): Promise<void> {
    await this.plugin?.start?.();
  }

  public async stop(): Promise<void> {
    await this.plugin?.stop?.();
  }

  public async invoke(payload: unknown): Promise<unknown> {
    if (this.plugin?.handle === undefined) {
      throw new ConfigError(`plugin "${this.config.tag}" does not expose handle()`);
    }
    return await this.plugin.handle(payload);
  }

  private async instantiatePlugin(imported: unknown, pluginContext: SepigsPluginContext): Promise<SepigsPlugin> {
    const namespace = isRecord(imported) ? imported : {};
    const exported = namespace.default ?? namespace.plugin ?? imported;

    if (isPluginFactory(exported)) {
      const created = await exported(pluginContext);
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

    throw new ConfigError(`plugin "${this.config.tag}" must export a plugin object or a plugin factory`);
  }
}
