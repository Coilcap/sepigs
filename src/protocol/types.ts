import type { Duplex } from "node:stream";

export type Network = "tcp" | "udp";
export type InboundProtocol = "http" | "socks5" | `plugin.${string}`;
export type AddressType = "domain" | "ipv4" | "ipv6";

export interface Destination {
  readonly host: string;
  readonly port: number;
  readonly addressType: AddressType;
}

export interface SourceAddress {
  readonly host: string;
  readonly port: number;
}

export interface ProxyRequest {
  readonly id: string;
  readonly inboundTag: string;
  readonly protocol: InboundProtocol;
  readonly network: Network;
  readonly destination: Destination;
  readonly source?: SourceAddress;
  readonly startedAt: number;
}

export interface TcpOutboundConnection {
  readonly socket: TcpStream;
  readonly outboundTag: string;
}

export interface TcpStream extends Duplex {
  readonly destroyed: boolean;
  setTimeout(timeoutMs: number): unknown;
}

export interface UdpOutboundPacket {
  readonly payload: Buffer;
  readonly source: Destination;
}

export interface UdpPacket {
  readonly source: SourceAddress;
  readonly destination: Destination;
  readonly payload: Buffer;
}
