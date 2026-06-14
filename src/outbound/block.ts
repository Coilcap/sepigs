import type { BlockOutboundConfig } from "../config/types.js";
import type { ProxyRequest, TcpOutboundConnection, UdpOutboundPacket } from "../protocol/types.js";
import { OutboundBlockedError } from "../utils/errors.js";
import type { Outbound } from "./outbound.js";

export class BlockOutbound implements Outbound {
  public readonly tag: string;
  public readonly type = "block" as const;
  private readonly reason: string;

  public constructor(config: BlockOutboundConfig) {
    this.tag = config.tag;
    this.reason = config.reason ?? "blocked by route";
  }

  public connect(request: ProxyRequest): Promise<TcpOutboundConnection> {
    return Promise.reject(new OutboundBlockedError(`${this.reason}: ${request.destination.host}:${request.destination.port}`));
  }

  public sendUdp(request: ProxyRequest, payload: Buffer): Promise<UdpOutboundPacket | undefined> {
    return Promise.reject(
      new OutboundBlockedError(`${this.reason}: ${request.destination.host}:${request.destination.port}, ${payload.byteLength} UDP bytes`)
    );
  }

  public async stop(): Promise<void> {
    await Promise.resolve();
  }
}
