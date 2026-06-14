import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import type { WasmExtensionConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { ConfigError } from "../utils/errors.js";

type WasmNumberFunction = (...args: readonly number[]) => number;
type WasmExportValue = WasmNumberFunction | object;

interface WasmModule {
  readonly __sepigsWasmModuleBrand?: never;
}

interface WasmInstance {
  readonly exports: Readonly<Record<string, WasmExportValue>>;
}

interface WasmRuntime {
  compile(bytes: Uint8Array): Promise<WasmModule>;
  instantiate(module: WasmModule, imports: Readonly<Record<string, unknown>>): Promise<WasmInstance>;
}

const getWasmRuntime = (): WasmRuntime => {
  const runtime = (globalThis as unknown as { readonly WebAssembly?: WasmRuntime }).WebAssembly;
  if (runtime === undefined) {
    throw new ConfigError("WebAssembly runtime is not available in this Node.js build");
  }
  return runtime;
};

export interface WasmExtensionSnapshot {
  readonly tag: string;
  readonly exports: readonly string[];
}

export class WasmExtension {
  public readonly tag: string;
  private readonly instance: WasmInstance;

  public constructor(tag: string, instance: WasmInstance) {
    this.tag = tag;
    this.instance = instance;
  }

  public exportNames(): readonly string[] {
    return Object.keys(this.instance.exports);
  }

  public getExport(name: string): WasmExportValue | undefined {
    return this.instance.exports[name];
  }

  public callNumber(name: string, args: readonly number[] = []): number {
    const exported = this.getExport(name);
    if (typeof exported !== "function") {
      throw new ConfigError(`WASM extension "${this.tag}" export "${name}" is not a function`);
    }
    const fn = exported as WasmNumberFunction;
    return fn(...args);
  }
}

export class WasmExtensionManager {
  private readonly logger: Logger;
  private readonly extensions = new Map<string, WasmExtension>();

  public constructor(logger: Logger) {
    this.logger = logger;
  }

  public async loadAll(configs: readonly WasmExtensionConfig[]): Promise<void> {
    for (const config of configs) {
      if (!config.enabled) {
        this.logger.debug("WASM extension disabled", { tag: config.tag, path: config.path });
        continue;
      }
      if (this.extensions.has(config.tag)) {
        continue;
      }
      await this.loadOne(config);
    }
  }

  public get(tag: string): WasmExtension | undefined {
    return this.extensions.get(tag);
  }

  public list(): readonly WasmExtensionSnapshot[] {
    return [...this.extensions.values()].map((extension) => ({
      tag: extension.tag,
      exports: extension.exportNames()
    }));
  }

  private async loadOne(config: WasmExtensionConfig): Promise<void> {
    const resolvedPath = isAbsolute(config.path) ? config.path : resolve(process.cwd(), config.path);
    const bytes = await readFile(resolvedPath);
    try {
      const wasmRuntime = getWasmRuntime();
      const module = await wasmRuntime.compile(bytes);
      const instance = await wasmRuntime.instantiate(module, {});
      const extension = new WasmExtension(config.tag, instance);
      this.extensions.set(config.tag, extension);
      this.logger.info("WASM extension loaded", {
        tag: config.tag,
        path: resolvedPath,
        exports: extension.exportNames()
      });
    } catch (error) {
      throw new ConfigError(`failed to load WASM extension "${config.tag}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
