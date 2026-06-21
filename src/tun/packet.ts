import { ProtocolError } from "../utils/errors.js";

export interface Ipv4Packet {
  readonly version: 4;
  readonly headerLength: number;
  readonly totalLength: number;
  readonly protocol: "tcp" | "udp" | "other";
  readonly protocolNumber: number;
  readonly source: string;
  readonly destination: string;
  readonly payload: Buffer;
}

export const parseIpv4Packet = (packet: Buffer): Ipv4Packet => {
  if (packet.byteLength < 20 || (packet[0] ?? 0) >>> 4 !== 4) throw new ProtocolError("invalid IPv4 packet");
  const headerLength = ((packet[0] ?? 0) & 0x0f) * 4;
  const totalLength = packet.readUInt16BE(2);
  if (headerLength < 20 || totalLength < headerLength || totalLength > packet.byteLength) throw new ProtocolError("truncated IPv4 packet");
  const protocolNumber = packet[9] ?? 0;
  return {
    version: 4,
    headerLength,
    totalLength,
    protocol: protocolNumber === 6 ? "tcp" : protocolNumber === 17 ? "udp" : "other",
    protocolNumber,
    source: address(packet, 12),
    destination: address(packet, 16),
    payload: packet.subarray(headerLength, totalLength)
  };
};

const address = (packet: Buffer, offset: number): string => [...packet.subarray(offset, offset + 4)].join(".");
