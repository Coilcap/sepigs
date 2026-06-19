import type net from "node:net";
import type { AddressInfo } from "node:net";
import type { InboundConfig, LimitConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import type { ProxyRequest, SourceAddress, TcpOutboundConnection, UdpOutboundPacket } from "../protocol/types.js";
import type { StatsTracker } from "../core/stats.js";
import type { ConnectionManager } from "../core/connectionManager.js";

export interface InboundContext {
  readonly limits: LimitConfig;
  readonly logger: Logger;
  readonly stats: StatsTracker;
  readonly connectionManager: ConnectionManager;
  openTcp(request: ProxyRequest): Promise<TcpOutboundConnection>;
  sendUdp(request: ProxyRequest, payload: Buffer): Promise<UdpOutboundPacket | undefined>;
}

export interface Inbound {
  readonly tag: string;
  readonly type: InboundConfig["type"];
  start(): Promise<void>;
  stop(): Promise<void>;
  drain?(): Promise<void>;
  address(): AddressInfo | string | null;
}

export const socketSource = (socket: net.Socket): SourceAddress | undefined => {
  if (socket.remoteAddress === undefined || socket.remotePort === undefined) {
    return undefined;
  }
  return {
    host: socket.remoteAddress,
    port: socket.remotePort
  };
};
