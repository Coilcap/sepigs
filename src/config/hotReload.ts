import { watch, type FSWatcher } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { SepigsConfig } from "./types.js";
import { loadConfig } from "./loader.js";
import type { Logger } from "../logger/logger.js";
import { errorMessage } from "../utils/errors.js";

export interface HotReloadManagerOptions {
  readonly configPath: string;
  readonly initialConfig: SepigsConfig;
  readonly debounceMs: number;
  readonly logger: Logger;
  onReload(config: SepigsConfig): Promise<void>;
}

export class HotReloadManager {
  private readonly configPath: string;
  private readonly configDir: string;
  private readonly debounceMs: number;
  private readonly logger: Logger;
  private readonly onReload: (config: SepigsConfig) => Promise<void>;
  private readonly watchers = new Map<string, FSWatcher>();
  private timer: NodeJS.Timeout | undefined;
  private config: SepigsConfig;
  private started = false;

  public constructor(options: HotReloadManagerOptions) {
    this.configPath = resolve(options.configPath);
    this.configDir = dirname(this.configPath);
    this.config = options.initialConfig;
    this.debounceMs = options.debounceMs;
    this.logger = options.logger;
    this.onReload = async (config) => {
      await options.onReload(config);
    };
  }

  public start(): void {
    if (this.started) {
      return;
    }
    this.started = true;
    this.refreshWatchers();
  }

  public stop(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.started = false;
  }

  public watchedPaths(): readonly string[] {
    return [...this.watchers.keys()];
  }

  private refreshWatchers(): void {
    const nextPaths = new Set([this.configPath, ...this.config.route.ruleSetFiles.map((ruleSet) => this.resolveRuleSetPath(ruleSet.path))]);

    for (const [path, watcher] of this.watchers.entries()) {
      if (!nextPaths.has(path)) {
        watcher.close();
        this.watchers.delete(path);
      }
    }

    for (const path of nextPaths) {
      if (this.watchers.has(path)) {
        continue;
      }
      try {
        const watcher = watch(path, { persistent: false }, () => {
          this.scheduleReload(path);
        });
        watcher.on("error", (error) => {
          this.logger.warn("hot reload watcher failed", { path, error: error.message });
        });
        this.watchers.set(path, watcher);
      } catch (error) {
        this.logger.warn("failed to watch file for hot reload", { path, error: errorMessage(error) });
      }
    }
  }

  private scheduleReload(path: string): void {
    this.logger.debug("hot reload change observed", { path });
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
    }
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.reload();
    }, this.debounceMs);
    this.timer.unref();
  }

  private async reload(): Promise<void> {
    try {
      const config = await loadConfig(this.configPath);
      await this.onReload(config);
      this.config = config;
      this.refreshWatchers();
      this.logger.info("hot reload applied", {
        configPath: this.configPath,
        rules: config.route.rules.length,
        policies: config.route.policies.length
      });
    } catch (error) {
      this.logger.warn("hot reload rejected invalid config", { configPath: this.configPath, error: errorMessage(error) });
    }
  }

  private resolveRuleSetPath(path: string): string {
    return isAbsolute(path) ? path : resolve(this.configDir, path);
  }
}
