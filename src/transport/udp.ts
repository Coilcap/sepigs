import dgram from "node:dgram";
import type { UdpPacket } from "../protocol/types.js";
import type { Destination } from "../protocol/types.js";
import type { Logger } from "../logger/logger.js";
import { NetworkError, TimeoutError } from "../utils/errors.js";

export interface UdpTransport {
  send(packet: UdpPacket): Promise<void>;
  close(): Promise<void>;
}

export class UdpNotImplementedTransport implements UdpTransport {
  public send(packet: UdpPacket): Promise<void> {
    return Promise.reject(
      new Error(`UDP transport is reserved for a future release: ${packet.destination.host}:${packet.destination.port}`)
    );
  }

  public async close(): Promise<void> {
    await Promise.resolve();
  }
}

export const sendUdpDatagram = async (
  destination: Destination,
  payload: Buffer,
  timeoutMs: number,
  logger?: Logger
): Promise<Buffer | undefined> => {
  const socketType = destination.addressType === "ipv6" ? "udp6" : "udp4";
  const socket = dgram.createSocket(socketType);

  return await new Promise<Buffer | undefined>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("message", onMessage);
      socket.removeListener("error", onError);
      socket.close();
    };

    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const onMessage = (message: Buffer): void => {
      finish(() => {
        resolve(message);
      });
    };

    const onError = (error: Error): void => {
      logger?.debug("udp send failed", { destination: `${destination.host}:${destination.port}`, error: error.message });
      finish(() => {
        reject(new NetworkError(`failed to send UDP packet to ${destination.host}:${destination.port}`, { cause: error }));
      });
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(new TimeoutError(`udp response timeout after ${timeoutMs}ms for ${destination.host}:${destination.port}`));
      });
    }, timeoutMs);

    socket.once("message", onMessage);
    socket.once("error", onError);
    socket.send(payload, destination.port, destination.host, (error) => {
      if (error !== null) {
        onError(error);
      }
    });
  });
};
