import type { LimitConfig, TcpRelayOutboundConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import type { ProxyRequest, TcpOutboundConnection } from "../protocol/types.js";
import { connectTcp } from "../utils/net.js";
import type { Outbound } from "./outbound.js";

export class TcpRelayOutbound implements Outbound {
  public readonly tag: string;
  public readonly type = "tcpRelay" as const;
  private readonly config: TcpRelayOutboundConfig;
  private readonly limits: LimitConfig;
  private readonly logger: Logger;

  public constructor(config: TcpRelayOutboundConfig, limits: LimitConfig, logger: Logger) {
    this.tag = config.tag;
    this.config = config;
    this.limits = limits;
    this.logger = logger;
  }

  public async connect(request: ProxyRequest): Promise<TcpOutboundConnection> {
    this.logger.debug("tcp relay selected", {
      requestedDestination: `${request.destination.host}:${request.destination.port}`,
      relayTarget: `${this.config.targetHost}:${this.config.targetPort}`
    });
    const timeoutMs = this.config.connectTimeoutMs ?? this.limits.connectTimeoutMs;
    const socket = await connectTcp(this.config.targetHost, this.config.targetPort, timeoutMs, this.logger);
    return { socket, outboundTag: this.tag };
  }

  public async stop(): Promise<void> {
    await Promise.resolve();
  }
}
