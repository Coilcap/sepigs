import dgram from "node:dgram";
import net from "node:net";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { TcpStream } from "../src/protocol/types.js";

export interface TestTcpServer {
  readonly server: net.Server;
  readonly port: number;
  close(): Promise<void>;
}

export interface TestHttpServer {
  readonly server: http.Server;
  readonly port: number;
  close(): Promise<void>;
}

export interface TestUdpServer {
  readonly server: dgram.Socket;
  readonly port: number;
  close(): Promise<void>;
}

export const startTcpEchoServer = async (): Promise<TestTcpServer> => {
  const server = net.createServer((socket) => {
    socket.on("error", () => undefined);
    socket.pipe(socket);
  });

  await listen(server, 0, "127.0.0.1");
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("test TCP server did not bind to an address");
  }

  return {
    server,
    port: address.port,
    close: async () => {
      await closeServer(server);
    }
  };
};

export const startHttpServer = async (handler: http.RequestListener): Promise<TestHttpServer> => {
  const server = http.createServer(handler);
  await listen(server, 0, "127.0.0.1");
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("test HTTP server did not bind to an address");
  }

  return {
    server,
    port: address.port,
    close: async () => {
      await closeServer(server);
    }
  };
};

export const startUdpEchoServer = async (): Promise<TestUdpServer> => {
  const server = dgram.createSocket("udp4");
  server.on("message", (message, rinfo) => {
    server.send(message, rinfo.port, rinfo.address);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.bind(0, "127.0.0.1");
  });

  const address = server.address();
  return {
    server,
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  };
};

export const connectClient = async (port: number): Promise<net.Socket> => {
  return await new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const onError = (error: Error): void => {
      socket.removeListener("connect", onConnect);
      reject(error);
    };
    const onConnect = (): void => {
      socket.removeListener("error", onError);
      resolve(socket);
    };
    socket.once("error", onError);
    socket.once("connect", onConnect);
  });
};

export const readUntil = async (socket: TcpStream, predicate: (buffer: Buffer) => boolean, timeoutMs = 2_000): Promise<Buffer> => {
  return await new Promise<Buffer>((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for socket data"));
    }, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };

    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk], buffer.byteLength + chunk.byteLength);
      if (predicate(buffer)) {
        cleanup();
        resolve(buffer);
      }
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const onClose = (): void => {
      cleanup();
      reject(new Error("socket closed before expected data arrived"));
    };

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
};

export const readBytes = async (socket: TcpStream, length: number, timeoutMs = 2_000): Promise<Buffer> => {
  return await readUntil(socket, (buffer) => buffer.byteLength >= length, timeoutMs);
};

export const sendUdpAndRead = async (
  port: number,
  host: string,
  payload: Buffer,
  timeoutMs = 2_000
): Promise<Buffer> => {
  const socket = dgram.createSocket("udp4");
  return await new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for UDP response"));
    }, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("message", onMessage);
      socket.removeListener("error", onError);
      socket.close();
    };

    const onMessage = (message: Buffer): void => {
      cleanup();
      resolve(message);
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    socket.once("message", onMessage);
    socket.once("error", onError);
    socket.send(payload, port, host, (error) => {
      if (error !== null) {
        onError(error);
      }
    });
  });
};

export const waitFor = async (predicate: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
  }
  throw new Error("condition was not met before timeout");
};

export const waitForSocketClose = async (socket: TcpStream, timeoutMs = 2_000): Promise<void> => {
  if (socket.destroyed) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for socket close"));
    }, timeoutMs);

    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("close", onClose);
      socket.removeListener("error", onError);
    };

    const onClose = (): void => {
      cleanup();
      resolve();
    };

    const onError = (): void => {
      cleanup();
      resolve();
    };

    socket.once("close", onClose);
    socket.once("error", onError);
  });
};

export const getPort = (address: AddressInfo | string | null): number => {
  if (typeof address === "object" && address !== null) {
    return address.port;
  }
  throw new Error("expected TCP address");
};

const listen = async (server: net.Server | http.Server, port: number, host: string): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(port, host);
  });
};

const closeServer = async (server: net.Server | http.Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
};
