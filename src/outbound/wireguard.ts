import type { LimitConfig, WireGuardOutboundConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import type { ProxyRequest, TcpOutboundConnection, UdpOutboundPacket } from "../protocol/types.js";
import { NetworkError } from "../utils/errors.js";
import type { Outbound } from "./outbound.js";

export class WireGuardOutbound implements Outbound {
  public readonly tag: string;
  public readonly type = "wireguard" as const;
  private readonly config: WireGuardOutboundConfig;
  private readonly logger: Logger;

  public constructor(config: WireGuardOutboundConfig, _limits: LimitConfig, logger: Logger) {
    this.tag = config.tag;
    this.config = config;
    this.logger = logger;
  }

  public connect(request: ProxyRequest): Promise<TcpOutboundConnection> {
    this.logger.warn("wireguard outbound cannot proxy TCP streams without a packet tunnel transport", {
      tag: this.tag,
      destination: `${request.destination.host}:${request.destination.port}`,
      endpoint: `${this.config.peer.endpointHost}:${this.config.peer.endpointPort}`
    });
    return Promise.reject(new NetworkError("WireGuard outbound requires a packet tunnel transport; TCP stream proxying is not supported"));
  }

  public sendUdp(request: ProxyRequest, payload: Buffer): Promise<UdpOutboundPacket | undefined> {
    this.logger.warn("wireguard outbound packet tunnel is not active", {
      tag: this.tag,
      destination: `${request.destination.host}:${request.destination.port}`,
      bytes: payload.byteLength
    });
    return Promise.reject(new NetworkError("WireGuard outbound requires a full packet tunnel transport; UDP relay is not active"));
  }

  public async stop(): Promise<void> {
    await Promise.resolve();
  }
}
