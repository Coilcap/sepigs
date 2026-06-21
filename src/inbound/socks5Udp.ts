import type { Destination } from "../protocol/types.js";
import { encodeSocksAddress } from "../protocol/address.js";
import { makeDestination } from "../utils/net.js";
import { ProtocolError } from "../utils/errors.js";

export interface SocksUdpPacket { readonly destination: Destination; readonly payload: Buffer }

export const parseSocksUdpPacket = (message: Buffer): SocksUdpPacket => {
  if (message.byteLength < 7) throw new ProtocolError("SOCKS5 UDP packet is too short");
  if (message[0] !== 0 || message[1] !== 0) throw new ProtocolError("SOCKS5 UDP packet has invalid reserved bytes");
  if (message[2] !== 0) throw new ProtocolError("SOCKS5 UDP fragmentation is not supported");
  const parsed = readAddress(message, 4, message[3] ?? -1);
  const high = message[parsed.offset]; const low = message[parsed.offset + 1];
  if (high === undefined || low === undefined) throw new ProtocolError("SOCKS5 UDP packet missing destination port");
  return { destination: makeDestination(parsed.host, (high << 8) + low), payload: message.subarray(parsed.offset + 2) };
};

export const encodeSocksUdpPacket = (source: Destination, payload: Buffer): Buffer => Buffer.concat([Buffer.from([0, 0, 0]), encodeSocksAddress(source), payload]);

const readAddress = (buffer: Buffer, offset: number, type: number): { host: string; offset: number } => {
  if (type === 1) { const end = offset + 4; if (end > buffer.byteLength) throw new ProtocolError("SOCKS5 UDP IPv4 address is truncated"); return { host: [...buffer.subarray(offset, end)].join("."), offset: end }; }
  if (type === 3) { const length = buffer[offset] ?? 0; const start = offset + 1; const end = start + length; if (length === 0 || end > buffer.byteLength) throw new ProtocolError("SOCKS5 UDP domain is truncated"); return { host: buffer.subarray(start, end).toString("utf8"), offset: end }; }
  if (type === 4) { const end = offset + 16; if (end > buffer.byteLength) throw new ProtocolError("SOCKS5 UDP IPv6 address is truncated"); const groups: string[] = []; for (let index = offset; index < end; index += 2) groups.push((((buffer[index] ?? 0) << 8) + (buffer[index + 1] ?? 0)).toString(16)); return { host: groups.join(":"), offset: end }; }
  throw new ProtocolError(`unsupported SOCKS5 UDP address type ${type}`);
};
