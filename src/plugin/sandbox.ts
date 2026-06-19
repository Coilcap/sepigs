import { ConfigError } from "../utils/errors.js";
import type { PluginManifest, PluginPermission } from "./manifest.js";
import type { SepigsPluginContext } from "./types.js";

export const createPluginSandbox = (context: SepigsPluginContext, manifest: PluginManifest): SepigsPluginContext => {
  const hasPermission = (permission: PluginPermission): boolean => manifest.permissions.includes(permission);
  return {
    logger: context.logger.child(`plugin:${manifest.name}`),
    workerPool: hasPermission("worker") ? context.workerPool : undefined,
    wasmExtensions: context.wasmExtensions,
    registerInboundFactory: (type, factory) => {
      if (!hasPermission("inbound:register")) {
        throw new ConfigError(`plugin "${manifest.name}" does not have inbound:register permission`);
      }
      context.registerInboundFactory(type, factory);
    },
    registerOutboundFactory: (type, factory) => {
      if (!hasPermission("outbound:register")) {
        throw new ConfigError(`plugin "${manifest.name}" does not have outbound:register permission`);
      }
      context.registerOutboundFactory(type, factory);
    }
  };
};
