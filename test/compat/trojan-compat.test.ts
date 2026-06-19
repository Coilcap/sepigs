import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import net from "node:net";
import test from "node:test";
import type { TrojanOutboundConfig } from "../../src/config/types.js";
import { TrojanOutbound } from "../../src/outbound/trojan.js";
import { decodeSocksAddress } from "../../src/protocol/address.js";
import type { ProxyRequest } from "../../src/protocol/types.js";
import { closeSocket } from "../../src/utils/net.js";
import { Logger } from "../../src/logger/logger.js";
import { readUntil, startTcpEchoServer } from "../helpers.js";

void test("Trojan outbound interoperates with local reference server in TCP plain test mode", async () => {
  const echo = await startTcpEchoServer();
  const trojan = await startReferenceTrojanServer("secret");
  const outbound = new TrojanOutbound(
    {
      type: "trojan",
      tag: "trojan",
      serverHost: "127.0.0.1",
      serverPort: trojan.port,
      password: "secret",
      tls: { enabled: false, rejectUnauthorized: false }
    } satisfies TrojanOutboundConfig,
    limits(),
    new Logger("silent")
  );

  const connection = await outbound.connect(request(echo.port));
  try {
    connection.socket.write("trojan-compat");
    const response = await readUntil(connection.socket, (buffer) => buffer.includes("trojan-compat"));
    assert.equal(response.toString(), "trojan-compat");
  } finally {
    closeSocket(connection.socket);
    await outbound.stop();
    await trojan.close();
    await echo.close();
  }
});

const startReferenceTrojanServer = async (password: string): Promise<{ readonly port: number; close(): Promise<void> }> => {
  const expectedHash = createHash("sha224").update(password).digest("hex");
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let remote: net.Socket | undefined;
    const onData = (chunk: Buffer): void => {
      if (remote !== undefined) {
        remote.write(chunk);
        return;
      }
      buffer = Buffer.concat([buffer, chunk]);
      const firstLineEnd = buffer.indexOf("\r\n");
      if (firstLineEnd < 0) {
        return;
      }
      assert.equal(buffer.subarray(0, firstLineEnd).toString("ascii"), expectedHash);
      const commandOffset = firstLineEnd + 2;
      if (buffer[commandOffset] !== 0x01) {
        socket.destroy(new Error("unsupported trojan command"));
        return;
      }
      try {
        const decoded = decodeSocksAddress(buffer, commandOffset + 1);
        if (buffer.subarray(decoded.offset, decoded.offset + 2).toString("ascii") !== "\r\n") {
          return;
        }
        const remainder = buffer.subarray(decoded.offset + 2);
        const nextRemote = net.createConnection({ host: decoded.destination.host, port: decoded.destination.port }, () => {
          if (remainder.byteLength > 0) {
            nextRemote.write(remainder);
          }
          socket.removeListener("data", onData);
          socket.pipe(nextRemote);
          nextRemote.pipe(socket);
        });
        remote = nextRemote;
        nextRemote.on("error", () => {
          socket.destroy();
        });
      } catch (error) {
        if (error instanceof Error && /truncated|missing/u.test(error.message)) {
          return;
        }
        socket.destroy(error instanceof Error ? error : new Error(String(error)));
      }
    };
    socket.on("data", onData);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
    server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("reference Trojan server failed to bind");
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
  id: "trojan-compat",
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
