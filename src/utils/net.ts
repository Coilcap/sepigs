import net from "node:net";
import { NetworkError, ProtocolError, TimeoutError } from "./errors.js";
import type { AddressType, Destination, TcpStream } from "../protocol/types.js";
import type { Logger } from "../logger/logger.js";
import { zeroCopyRelay } from "../transport/zeroCopy.js";

export const detectAddressType = (host: string): AddressType => {
  const ipVersion = net.isIP(host);
  if (ipVersion === 4) {
    return "ipv4";
  }
  if (ipVersion === 6) {
    return "ipv6";
  }
  return "domain";
};

export const makeDestination = (host: string, port: number): Destination => ({
  host,
  port,
  addressType: detectAddressType(host)
});

export const closeSocket = (socket: TcpStream): void => {
  if (!socket.destroyed) {
    socket.destroy();
  }
};

export const writeSocket = async (socket: TcpStream, data: Buffer | string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    if (socket.destroyed || !socket.writable) {
      reject(new NetworkError("socket write failed because the socket is not writable"));
      return;
    }

    let settled = false;
    const onError = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.removeListener("error", onError);
      reject(new NetworkError("socket write failed", { cause: error }));
    };

    socket.once("error", onError);
    try {
      socket.write(data, () => {
        if (settled) {
          return;
        }
        settled = true;
        setImmediate(() => {
          socket.removeListener("error", onError);
        });
        resolve();
      });
    } catch (error) {
      settled = true;
      socket.removeListener("error", onError);
      reject(new NetworkError("socket write failed", { cause: error instanceof Error ? error : new Error(String(error)) }));
    }
  });
};

export const connectTcp = async (
  host: string,
  port: number,
  timeoutMs: number,
  logger?: Logger
): Promise<net.Socket> => {
  return await new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    let settled = false;

    const cleanup = (): void => {
      socket.removeListener("connect", onConnect);
      socket.removeListener("error", onError);
      socket.removeListener("timeout", onTimeout);
      socket.setTimeout(0);
    };

    const fail = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      closeSocket(socket);
      reject(error);
    };

    const onConnect = (): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      socket.setNoDelay(true);
      resolve(socket);
    };

    const onError = (error: Error): void => {
      logger?.debug("tcp connect failed", { host, port, error: error.message });
      fail(new NetworkError(`failed to connect to ${host}:${port}`, { cause: error }));
    };

    const onTimeout = (): void => {
      fail(new TimeoutError(`tcp connect timeout after ${timeoutMs}ms for ${host}:${port}`));
    };

    socket.once("connect", onConnect);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
    socket.setTimeout(timeoutMs);
  });
};

export interface PipeSocketsOptions {
  readonly connectionId: string;
  readonly idleTimeoutMs: number;
  readonly logger: Logger;
  readonly onBytesClientToRemote?: (bytes: number) => void;
  readonly onBytesRemoteToClient?: (bytes: number) => void;
  readonly onClose?: (failed: boolean, reason: string) => void;
}

export const pipeSockets = (client: TcpStream, remote: TcpStream, options: PipeSocketsOptions): void => {
  zeroCopyRelay(client, remote, options);
};

const waitForReadable = async (socket: net.Socket, timeoutMs: number): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("readable", onReadable);
      socket.removeListener("end", onEnd);
      socket.removeListener("close", onClose);
      socket.removeListener("error", onError);
    };

    const finish = (callback: () => void): void => {
      if (settled) {
        return;
      }
      settled = true;
      cleanup();
      callback();
    };

    const onReadable = (): void => {
      finish(resolve);
    };
    const onEnd = (): void => {
      finish(() => {
        reject(new ProtocolError("socket ended while reading protocol data"));
      });
    };
    const onClose = (): void => {
      finish(() => {
        reject(new ProtocolError("socket closed while reading protocol data"));
      });
    };
    const onError = (error: Error): void => {
      finish(() => {
        reject(new NetworkError("socket error while reading protocol data", { cause: error }));
      });
    };

    const timer = setTimeout(() => {
      finish(() => {
        reject(new TimeoutError(`protocol read timeout after ${timeoutMs}ms`));
      });
    }, timeoutMs);

    socket.once("readable", onReadable);
    socket.once("end", onEnd);
    socket.once("close", onClose);
    socket.once("error", onError);
  });
};

export class BufferedSocketReader {
  private buffer: Buffer = Buffer.alloc(0);
  private readonly socket: net.Socket;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  public constructor(socket: net.Socket, timeoutMs: number, maxBytes: number) {
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.socket.pause();
  }

  public async readExact(length: number): Promise<Buffer> {
    while (this.buffer.byteLength < length) {
      await this.pull();
    }

    const output = this.buffer.subarray(0, length);
    this.buffer = this.buffer.subarray(length);
    return output;
  }

  public async readUntil(predicate: (buffer: Buffer) => boolean): Promise<Buffer> {
    while (!predicate(this.buffer)) {
      await this.pull();
    }

    const output = this.buffer;
    this.buffer = Buffer.alloc(0);
    return output;
  }

  public releaseRemainder(): Buffer {
    const output = this.buffer;
    this.buffer = Buffer.alloc(0);
    return output;
  }

  private async pull(): Promise<void> {
    let appended = false;
    let chunk = this.socket.read() as Buffer | null;
    while (chunk !== null) {
      this.append(chunk);
      appended = true;
      chunk = this.socket.read() as Buffer | null;
    }

    if (appended) {
      return;
    }

    await waitForReadable(this.socket, this.timeoutMs);

    chunk = this.socket.read() as Buffer | null;
    if (chunk === null) {
      return;
    }
    this.append(chunk);
  }

  private append(chunk: Buffer): void {
    const nextLength = this.buffer.byteLength + chunk.byteLength;
    if (nextLength > this.maxBytes) {
      throw new ProtocolError(`protocol data exceeded ${this.maxBytes} bytes`);
    }
    this.buffer = this.buffer.byteLength === 0 ? chunk : Buffer.concat([this.buffer, chunk], nextLength);
  }
}
