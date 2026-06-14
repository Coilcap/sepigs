import type { Destination, TcpStream, UdpOutboundPacket } from "../protocol/types.js";

export interface TcpTransport {
  connect(destination: Destination, timeoutMs: number): Promise<TcpStream>;
}

export interface UdpRelayTransport {
  send(destination: Destination, payload: Buffer, timeoutMs: number): Promise<UdpOutboundPacket | undefined>;
}

export interface Transport extends TcpTransport, UdpRelayTransport {
  close(): Promise<void>;
}
