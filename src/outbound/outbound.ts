import type { OutboundConfig } from "../config/types.js";
import type { ProxyRequest, TcpOutboundConnection, UdpOutboundPacket } from "../protocol/types.js";

export interface Outbound {
  readonly tag: string;
  readonly type: OutboundConfig["type"];
  connect(request: ProxyRequest): Promise<TcpOutboundConnection>;
  sendUdp?(request: ProxyRequest, payload: Buffer): Promise<UdpOutboundPacket | undefined>;
  stop(): Promise<void>;
}
