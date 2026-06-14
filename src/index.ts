#!/usr/bin/env node
import { loadConfig } from "./config/loader.js";
import { HotReloadManager } from "./config/hotReload.js";
import { Engine } from "./core/engine.js";
import { Logger } from "./logger/logger.js";
import { errorMessage } from "./utils/errors.js";

const configPath = process.argv[2] ?? "examples/sepigs.json";

const main = async (): Promise<void> => {
  const config = await loadConfig(configPath);
  const logger = new Logger(config.log.level);
  const engine = new Engine(config, logger);
  const hotReload =
    config.hotReload.enabled ?
      new HotReloadManager({
        configPath,
        initialConfig: config,
        debounceMs: config.hotReload.debounceMs,
        logger: logger.child("hot-reload"),
        onReload: async (nextConfig) => {
          await engine.reloadConfig(nextConfig);
        }
      })
    : undefined;

  let stopping = false;
  const stop = async (signal: NodeJS.Signals): Promise<void> => {
    if (stopping) {
      return;
    }
    stopping = true;
    logger.info("received shutdown signal", { signal });
    try {
      hotReload?.stop();
      await engine.stop();
      process.exitCode = 0;
    } catch (error) {
      logger.error("shutdown failed", { error: errorMessage(error) });
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", (signal) => {
    void stop(signal);
  });
  process.once("SIGTERM", (signal) => {
    void stop(signal);
  });

  await engine.start();
  hotReload?.start();
};

main().catch((error: unknown) => {
  const logger = new Logger("error");
  logger.error("sepigs failed", { error: errorMessage(error) });
  process.exitCode = 1;
});
