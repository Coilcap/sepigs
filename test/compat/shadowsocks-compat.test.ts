import assert from "node:assert/strict";
import net from "node:net";
import test from "node:test";
import type { ShadowsocksCipher, ShadowsocksOutboundConfig } from "../../src/config/types.js";
import { ShadowsocksOutbound } from "../../src/outbound/shadowsocks.js";
import { decodeSocksAddress } from "../../src/protocol/address.js";
import { createShadowsocksCryptoContext, createShadowsocksServerStream } from "../../src/protocol/shadowsocks.js";
import type { ProxyRequest } from "../../src/protocol/types.js";
import { closeSocket } from "../../src/utils/net.js";
import { Logger } from "../../src/logger/logger.js";
import { readUntil, startTcpEchoServer } from "../helpers.js";

const METHODS: readonly ShadowsocksCipher[] = ["aes-128-gcm", "aes-256-gcm", "chacha20-ietf-poly1305"];

for (const method of METHODS) {
  void test(`Shadowsocks outbound interoperates with local reference server using ${method}`, async () => {
    const echo = await startTcpEchoServer();
    const server = await startReferenceShadowsocksServer(method, "secret");
    const outbound = new ShadowsocksOutbound(
      {
        type: "shadowsocks",
        tag: "ss",
        serverHost: "127.0.0.1",
        serverPort: server.port,
        method,
        password: "secret"
      } satisfies ShadowsocksOutboundConfig,
      limits(),
      new Logger("silent")
    );

    const connection = await outbound.connect(request(echo.port));
    try {
      connection.socket.write("ss-compat");
      const response = await readUntil(connection.socket, (buffer) => buffer.includes("ss-compat"));
      assert.equal(response.toString(), "ss-compat");
    } finally {
      closeSocket(connection.socket);
      await outbound.stop();
      await server.close();
      await echo.close();
    }
  });
}

const startReferenceShadowsocksServer = async (
  method: ShadowsocksCipher,
  password: string
): Promise<{ readonly port: number; close(): Promise<void> }> => {
  const context = createShadowsocksCryptoContext(method, password);
  const server = net.createServer((socket) => {
    const stream = createShadowsocksServerStream(socket, context);
    let buffer = Buffer.alloc(0);
    let remote: net.Socket | undefined;

    const onData = (chunk: Buffer): void => {
      if (remote !== undefined) {
        remote.write(chunk);
        return;
      }
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const decoded = decodeSocksAddress(buffer, 0);
        const remainder = buffer.subarray(decoded.offset);
        const nextRemote = net.createConnection({ host: decoded.destination.host, port: decoded.destination.port }, () => {
          if (remainder.byteLength > 0) {
            nextRemote.write(remainder);
          }
          stream.removeListener("data", onData);
          stream.pipe(nextRemote);
          nextRemote.pipe(stream);
        });
        remote = nextRemote;
        nextRemote.on("error", () => {
          stream.destroy();
        });
      } catch (error) {
        if (error instanceof Error && /truncated|missing/u.test(error.message)) {
          return;
        }
        stream.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    };
    stream.on("data", onData);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
    server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("reference Shadowsocks server failed to bind");
  }
  return {
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
};

const request = (port: number): ProxyRequest => ({
  id: "ss-compat",
  inboundTag: "test",
  protocol: "http",
  network: "tcp",
  destination: { host: "127.0.0.1", port, addressType: "ipv4" },
  startedAt: Date.now()
});

const limits = () => ({
  connectTimeoutMs: 1_000,
  handshakeTimeoutMs: 1_000,
  idleTimeoutMs: 1_000,
  shutdownTimeoutMs: 1_000,
  maxHeaderBytes: 64 * 1024,
  maxConnections: 100,
  leakReportIntervalMs: 60_000
});
