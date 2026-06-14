import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import net from "node:net";
import test from "node:test";
import type { OutboundConfig } from "../src/config/types.js";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { decodeSocksAddress } from "../src/protocol/address.js";
import { createShadowsocksCryptoContext, createShadowsocksServerStream } from "../src/protocol/shadowsocks.js";
import { parseSubscription } from "../src/subscription/parser.js";
import { closeSocket } from "../src/utils/net.js";
import { connectClient, getPort, readUntil, startTcpEchoServer, waitFor } from "./helpers.js";

void test("GeoIP and GeoSite rules expand without changing router logic", () => {
  const config = parseConfig({
    geo: {
      geoip: { private: ["10.0.0.0/8"] },
      geosite: { example: ["example.com", "example.org"] }
    },
    inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
    outbounds: [
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" }
    ],
    route: {
      defaultOutbound: "direct",
      rules: [
        { tag: "geoip", geoIp: ["private"], outboundTag: "block" },
        { tag: "geosite", geoSite: ["example"], outboundTag: "block" }
      ]
    }
  });

  assert.deepEqual(config.route.rules[0]?.ipCidr, ["10.0.0.0/8"]);
  assert.deepEqual(config.route.rules[1]?.domainSuffix, ["example.com", "example.org"]);
});

void test("Subscription parser converts ss, trojan, and wireguard URLs into outbounds", () => {
  const ssUser = Buffer.from("aes-128-gcm:secret@127.0.0.1:8388").toString("base64url");
  const result = parseSubscription(
    [
      `ss://${ssUser}#ss-node`,
      "trojan://password@trojan.example:443?sni=trojan.example#trojan-node",
      "wireguard://private:public@wg.example:51820?address=10.0.0.2/32&allowedIps=0.0.0.0/0#wg-node"
    ].join("\n")
  );

  assert.equal(result.outbounds.length, 3);
  assert.equal(result.outbounds[0]?.type, "shadowsocks");
  assert.equal(result.outbounds[1]?.type, "trojan");
  assert.equal(result.outbounds[2]?.type, "wireguard");
});

void test("DNS hosts are resolved by direct outbound", async () => {
  const echo = await startTcpEchoServer();
  const engine = new Engine(
    parseConfig({
      log: { level: "silent" },
      dns: { hosts: { "dns.test": "127.0.0.1" } },
      limits: {
        connectTimeoutMs: 1_000,
        handshakeTimeoutMs: 1_000,
        idleTimeoutMs: 1_000,
        shutdownTimeoutMs: 1_000,
        maxHeaderBytes: 64 * 1024,
        maxConnections: 10_000,
        leakReportIntervalMs: 60_000
      },
      inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
      outbounds: [{ type: "direct", tag: "direct" }],
      route: { defaultOutbound: "direct", rules: [] }
    })
  );
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write(`CONNECT dns.test:${echo.port} HTTP/1.1\r\nHost: dns.test:${echo.port}\r\n\r\n`);
    await readUntil(client, (buffer) => buffer.includes("200 Connection Established"));
    client.write("dns-ok");
    const response = await readUntil(client, (buffer) => buffer.includes("dns-ok"));
    assert.equal(response.toString(), "dns-ok");
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
  }
});

void test("Shadowsocks outbound works through the unified outbound registry", async () => {
  const echo = await startTcpEchoServer();
  const shadowsocks = await startShadowsocksMockServer("aes-128-gcm", "secret");
  const engine = createHttpEngineWithOutbound({
    type: "shadowsocks",
    tag: "ss",
    serverHost: "127.0.0.1",
    serverPort: shadowsocks.port,
    method: "aes-128-gcm",
    password: "secret"
  });
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    await readUntil(client, (buffer) => buffer.includes("200 Connection Established"));
    client.write("ss-ok");
    const response = await readUntil(client, (buffer) => buffer.includes("ss-ok"));
    assert.equal(response.toString(), "ss-ok");
  } finally {
    closeSocket(client);
    await engine.stop();
    await shadowsocks.close();
    await echo.close();
  }
});

void test("Trojan outbound works through the unified outbound registry", async () => {
  const echo = await startTcpEchoServer();
  const trojan = await startTrojanMockServer("secret");
  const engine = createHttpEngineWithOutbound({
    type: "trojan",
    tag: "trojan",
    serverHost: "127.0.0.1",
    serverPort: trojan.port,
    password: "secret",
    tls: { enabled: false, rejectUnauthorized: false }
  });
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    await readUntil(client, (buffer) => buffer.includes("200 Connection Established"));
    client.write("trojan-ok");
    const response = await readUntil(client, (buffer) => buffer.includes("trojan-ok"));
    assert.equal(response.toString(), "trojan-ok");
  } finally {
    closeSocket(client);
    await engine.stop();
    await trojan.close();
    await echo.close();
  }
});

void test("WireGuard outbound is registered and fails with a clear capability error", async () => {
  const engine = createHttpEngineWithOutbound({
    type: "wireguard",
    tag: "wg",
    privateKey: "private",
    address: ["10.0.0.2/32"],
    peer: {
      publicKey: "public",
      endpointHost: "127.0.0.1",
      endpointPort: 51820,
      allowedIps: ["0.0.0.0/0"]
    }
  });
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write("CONNECT 127.0.0.1:443 HTTP/1.1\r\nHost: 127.0.0.1:443\r\n\r\n");
    const response = await readUntil(client, (buffer) => buffer.includes("\r\n\r\n"));
    assert.match(response.toString("latin1"), /502 Bad Gateway/u);
    await waitFor(() => engine.getActiveConnections().length === 0);
  } finally {
    closeSocket(client);
    await engine.stop();
  }
});

const createHttpEngineWithOutbound = (outbound: OutboundConfig): Engine => {
  return new Engine(
    parseConfig({
      log: { level: "silent" },
      limits: {
        connectTimeoutMs: 1_000,
        handshakeTimeoutMs: 1_000,
        idleTimeoutMs: 1_000,
        shutdownTimeoutMs: 1_000,
        maxHeaderBytes: 64 * 1024,
        maxConnections: 10_000,
        leakReportIntervalMs: 60_000
      },
      inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
      outbounds: [outbound],
      route: { defaultOutbound: outbound.tag, rules: [] }
    })
  );
};

const startShadowsocksMockServer = async (
  method: "aes-128-gcm",
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
      buffer = Buffer.concat([buffer, chunk], buffer.byteLength + chunk.byteLength);
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

  return await listenServer(server);
};

const startTrojanMockServer = async (password: string): Promise<{ readonly port: number; close(): Promise<void> }> => {
  const expectedHash = createHash("sha224").update(password).digest("hex");
  const server = net.createServer((socket) => {
    let buffer = Buffer.alloc(0);
    let remote: net.Socket | undefined;
    const onData = (chunk: Buffer): void => {
      if (remote !== undefined) {
        remote.write(chunk);
        return;
      }
      buffer = Buffer.concat([buffer, chunk], buffer.byteLength + chunk.byteLength);
      const firstLineEnd = buffer.indexOf("\r\n");
      if (firstLineEnd < 0) {
        return;
      }
      const receivedHash = buffer.subarray(0, firstLineEnd).toString("ascii");
      assert.equal(receivedHash, expectedHash);
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

  return await listenServer(server);
};

const listenServer = async (server: net.Server): Promise<{ readonly port: number; close(): Promise<void> }> => {
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
    server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("server did not bind");
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
