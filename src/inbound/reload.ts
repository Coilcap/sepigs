import type { InboundConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import type { Inbound } from "./inbound.js";

export interface InboundReloadOptions {
  readonly current: ReadonlyMap<string, Inbound>;
  readonly previousConfigs: readonly InboundConfig[];
  readonly nextConfigs: readonly InboundConfig[];
  readonly logger: Logger;
  createInbound(config: InboundConfig): Inbound;
}

export interface InboundReloadResult {
  readonly inbounds: Map<string, Inbound>;
  readonly reloaded: boolean;
}

const inboundConfigKey = (configs: readonly InboundConfig[]): string => {
  return JSON.stringify(
    [...configs]
      .map((config) => config)
      .sort((left, right) => left.tag.localeCompare(right.tag))
  );
};

export const inboundConfigsChanged = (left: readonly InboundConfig[], right: readonly InboundConfig[]): boolean => {
  return inboundConfigKey(left) !== inboundConfigKey(right);
};

export const reloadInbounds = async (options: InboundReloadOptions): Promise<InboundReloadResult> => {
  const nextInbounds = new Map<string, Inbound>();
  const stagedInbounds = new Map<string, Inbound>();
  const previousByTag = new Map(options.previousConfigs.map((config) => [config.tag, config]));
  const reusedTags = new Set<string>();

  try {
    for (const config of options.nextConfigs) {
      const previousConfig = previousByTag.get(config.tag);
      const currentInbound = options.current.get(config.tag);
      if (previousConfig !== undefined && currentInbound !== undefined && inboundConfigKey([previousConfig]) === inboundConfigKey([config])) {
        nextInbounds.set(currentInbound.tag, currentInbound);
        reusedTags.add(currentInbound.tag);
        continue;
      }
      const inbound = options.createInbound(config);
      nextInbounds.set(inbound.tag, inbound);
      stagedInbounds.set(inbound.tag, inbound);
      await inbound.start();
    }
  } catch (error) {
    options.logger.warn("inbound hot reload failed; rolling back to existing listeners", {
      error: error instanceof Error ? error.message : String(error)
    });
    await stopAll(stagedInbounds);
    return {
      inbounds: new Map(options.current),
      reloaded: false
    };
  }

  for (const inbound of options.current.values()) {
    if (reusedTags.has(inbound.tag)) {
      continue;
    }
    if (inbound.drain !== undefined) {
      await inbound.drain();
    } else {
      await inbound.stop();
    }
  }

  options.logger.info("inbound hot reload applied", {
    oldInbounds: options.current.size,
    newInbounds: nextInbounds.size
  });

  return {
    inbounds: nextInbounds,
    reloaded: true
  };
};

const stopAll = async (inbounds: ReadonlyMap<string, Inbound>): Promise<void> => {
  await Promise.all(
    [...inbounds.values()].map(async (inbound) => {
      await inbound.stop();
    })
  );
};
