import { ProtocolError } from "../utils/errors.js";
import { makeDestination } from "../utils/net.js";
import type { Destination } from "./types.js";

export const encodeSocksAddress = (destination: Destination): Buffer => {
  const port = Buffer.from([(destination.port >> 8) & 0xff, destination.port & 0xff]);

  if (destination.addressType === "ipv4") {
    const parts = destination.host.split(".").map((part) => Number(part));
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      throw new ProtocolError(`invalid IPv4 address "${destination.host}"`);
    }
    return Buffer.from([0x01, ...parts, ...port]);
  }

  if (destination.addressType === "ipv6") {
    return Buffer.concat([Buffer.from([0x04]), ipv6ToBytes(destination.host), port]);
  }

  const host = Buffer.from(destination.host, "utf8");
  if (host.byteLength > 255) {
    throw new ProtocolError(`domain name is too long for SOCKS address: "${destination.host}"`);
  }
  return Buffer.concat([Buffer.from([0x03, host.byteLength]), host, port]);
};

export const decodeSocksAddress = (buffer: Buffer, offset: number): { readonly destination: Destination; readonly offset: number } => {
  const addressType = buffer[offset];
  if (addressType === undefined) {
    throw new ProtocolError("missing SOCKS address type");
  }

  if (addressType === 0x01) {
    const addressEnd = offset + 5;
    const portEnd = addressEnd + 2;
    if (portEnd > buffer.byteLength) {
      throw new ProtocolError("truncated IPv4 SOCKS address");
    }
    const host = Array.from(buffer.subarray(offset + 1, addressEnd)).join(".");
    return {
      destination: makeDestination(host, readPort(buffer, addressEnd)),
      offset: portEnd
    };
  }

  if (addressType === 0x03) {
    const length = buffer[offset + 1];
    if (length === undefined || length === 0) {
      throw new ProtocolError("invalid domain SOCKS address length");
    }
    const hostStart = offset + 2;
    const hostEnd = hostStart + length;
    const portEnd = hostEnd + 2;
    if (portEnd > buffer.byteLength) {
      throw new ProtocolError("truncated domain SOCKS address");
    }
    return {
      destination: makeDestination(buffer.subarray(hostStart, hostEnd).toString("utf8"), readPort(buffer, hostEnd)),
      offset: portEnd
    };
  }

  if (addressType === 0x04) {
    const addressEnd = offset + 17;
    const portEnd = addressEnd + 2;
    if (portEnd > buffer.byteLength) {
      throw new ProtocolError("truncated IPv6 SOCKS address");
    }
    const groups: string[] = [];
    for (let index = offset + 1; index < addressEnd; index += 2) {
      const high = buffer[index] ?? 0;
      const low = buffer[index + 1] ?? 0;
      groups.push(((high << 8) + low).toString(16));
    }
    return {
      destination: makeDestination(groups.join(":"), readPort(buffer, addressEnd)),
      offset: portEnd
    };
  }

  throw new ProtocolError(`unsupported SOCKS address type ${addressType}`);
};

const readPort = (buffer: Buffer, offset: number): number => {
  const high = buffer[offset];
  const low = buffer[offset + 1];
  if (high === undefined || low === undefined) {
    throw new ProtocolError("missing SOCKS address port");
  }
  return (high << 8) + low;
};

const ipv6ToBytes = (host: string): Buffer => {
  const parts = host.split("::");
  if (parts.length > 2) {
    throw new ProtocolError(`invalid IPv6 address "${host}"`);
  }

  const head = parseIpv6Groups(parts[0] ?? "");
  const tail = parseIpv6Groups(parts[1] ?? "");
  const missing = 8 - head.length - tail.length;
  const groups = parts.length === 2 ? [...head, ...Array.from({ length: missing }, () => 0), ...tail] : head;
  if (groups.length !== 8 || missing < 0) {
    throw new ProtocolError(`invalid IPv6 address "${host}"`);
  }

  const output = Buffer.alloc(16);
  groups.forEach((group, index) => {
    output[index * 2] = (group >> 8) & 0xff;
    output[index * 2 + 1] = group & 0xff;
  });
  return output;
};

const parseIpv6Groups = (input: string): number[] => {
  if (input.length === 0) {
    return [];
  }
  return input.split(":").map((part) => {
    const value = Number.parseInt(part, 16);
    if (!/^[0-9a-fA-F]{1,4}$/u.test(part) || !Number.isInteger(value) || value < 0 || value > 0xffff) {
      throw new ProtocolError(`invalid IPv6 group "${part}"`);
    }
    return value;
  });
};
