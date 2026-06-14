import type { LimitConfig, OutboundConfig } from "../config/types.js";
import type { DnsResolver } from "../dns/resolver.js";
import type { Logger } from "../logger/logger.js";
import { BlockOutbound } from "./block.js";
import { DirectOutbound } from "./direct.js";
import type { Outbound } from "./outbound.js";
import { ShadowsocksOutbound } from "./shadowsocks.js";
import { TcpRelayOutbound } from "./tcpRelay.js";
import { TrojanOutbound } from "./trojan.js";
import { WireGuardOutbound } from "./wireguard.js";

export interface OutboundFactoryContext {
  readonly limits: LimitConfig;
  readonly logger: Logger;
  readonly dnsResolver: DnsResolver;
}

type OutboundFactory<T extends OutboundConfig = OutboundConfig> = (config: T, context: OutboundFactoryContext) => Outbound;

const factories = new Map<string, OutboundFactory>();

export const registerOutboundFactory = <T extends OutboundConfig>(type: T["type"], factory: OutboundFactory<T>): void => {
  factories.set(type, factory as OutboundFactory);
};

export const createOutboundFromRegistry = (config: OutboundConfig, context: OutboundFactoryContext): Outbound => {
  const factory = factories.get(config.type);
  if (factory === undefined) {
    throw new Error(`no outbound factory registered for type "${config.type}"`);
  }
  return factory(config, context);
};

registerOutboundFactory("direct", (config, context) => {
  if (config.type !== "direct") {
    throw new Error(`invalid outbound config for direct factory: ${config.type}`);
  }
  return new DirectOutbound(config, context.limits, context.logger, context.dnsResolver);
});
registerOutboundFactory("block", (config) => {
  if (config.type !== "block") {
    throw new Error(`invalid outbound config for block factory: ${config.type}`);
  }
  return new BlockOutbound(config);
});
registerOutboundFactory("tcpRelay", (config, context) => {
  if (config.type !== "tcpRelay") {
    throw new Error(`invalid outbound config for tcpRelay factory: ${config.type}`);
  }
  return new TcpRelayOutbound(config, context.limits, context.logger);
});
registerOutboundFactory("shadowsocks", (config, context) => {
  if (config.type !== "shadowsocks") {
    throw new Error(`invalid outbound config for shadowsocks factory: ${config.type}`);
  }
  return new ShadowsocksOutbound(config, context.limits, context.logger);
});
registerOutboundFactory("trojan", (config, context) => {
  if (config.type !== "trojan") {
    throw new Error(`invalid outbound config for trojan factory: ${config.type}`);
  }
  return new TrojanOutbound(config, context.limits, context.logger);
});
registerOutboundFactory("wireguard", (config, context) => {
  if (config.type !== "wireguard") {
    throw new Error(`invalid outbound config for wireguard factory: ${config.type}`);
  }
  return new WireGuardOutbound(config, context.limits, context.logger);
});
