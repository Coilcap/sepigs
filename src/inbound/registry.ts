import type { InboundConfig } from "../config/types.js";
import { HttpInbound } from "./http.js";
import type { Inbound, InboundContext } from "./inbound.js";
import { Socks5Inbound } from "./socks5.js";
import type { Logger } from "../logger/logger.js";

type InboundFactory<T extends InboundConfig = InboundConfig> = (config: T, context: InboundContext, logger: Logger) => Inbound;

const factories = new Map<string, InboundFactory>();

export const registerInboundFactory = <T extends InboundConfig>(type: T["type"], factory: InboundFactory<T>): void => {
  factories.set(type, factory as InboundFactory);
};

export const createInboundFromRegistry = (config: InboundConfig, context: InboundContext, logger: Logger): Inbound => {
  const factory = factories.get(config.type);
  if (factory === undefined) {
    throw new Error(`no inbound factory registered for type "${config.type}"`);
  }
  return factory(config, context, logger);
};

registerInboundFactory("http", (config, context, logger) => {
  if (config.type !== "http") {
    throw new Error(`invalid inbound config for http factory: ${config.type}`);
  }
  return new HttpInbound(config, context, logger);
});
registerInboundFactory("socks5", (config, context, logger) => {
  if (config.type !== "socks5") {
    throw new Error(`invalid inbound config for socks5 factory: ${config.type}`);
  }
  return new Socks5Inbound(config, context, logger);
});
