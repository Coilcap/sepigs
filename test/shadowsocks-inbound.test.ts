import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { Logger } from "../src/logger/logger.js";
import { ShadowsocksOutbound } from "../src/outbound/shadowsocks.js";
import { closeSocket } from "../src/utils/net.js";
import { getPort, readUntil, startTcpEchoServer, waitFor } from "./helpers.js";

for (const method of ["aes-128-gcm", "aes-256-gcm", "chacha20-ietf-poly1305"] as const) {
  void test(`Shadowsocks ${method} inbound relays real encrypted TCP`, async () => {
    const echo = await startTcpEchoServer(); const engine = createEngine(method, "secret"); await engine.start();
    const client = new ShadowsocksOutbound({ type: "shadowsocks", tag: "client", serverHost: "127.0.0.1", serverPort: getPort(engine.getInboundAddress("ss")), method, password: "secret" }, limits, new Logger("silent"));
    const connection = await client.connect(request(echo.port));
    try { connection.socket.write("ss-inbound-ok"); assert.match((await readUntil(connection.socket, (buffer) => buffer.includes("ss-inbound-ok"))).toString(), /ss-inbound-ok/u); }
    finally { closeSocket(connection.socket); await engine.stop(); await echo.close(); }
  });
}

void test("Shadowsocks inbound rejects a wrong password without affecting the engine", async () => { const engine = createEngine("aes-128-gcm", "correct"); await engine.start(); const client = new ShadowsocksOutbound({ type: "shadowsocks", tag: "bad", serverHost: "127.0.0.1", serverPort: getPort(engine.getInboundAddress("ss")), method: "aes-128-gcm", password: "wrong" }, limits, new Logger("silent")); const connection = await client.connect(request(9)); connection.socket.on("error", () => undefined); try { connection.socket.write("bad"); await waitFor(() => connection.socket.destroyed && engine.getActiveConnections().length === 0); } finally { closeSocket(connection.socket); await engine.stop(); } });

const limits = { connectTimeoutMs: 500, handshakeTimeoutMs: 500, idleTimeoutMs: 1_000, shutdownTimeoutMs: 1_000, maxHeaderBytes: 65_536, maxConnections: 100, leakReportIntervalMs: 60_000 };
const createEngine = (method: "aes-128-gcm"|"aes-256-gcm"|"chacha20-ietf-poly1305", password: string): Engine => new Engine(parseConfig({ log: { level: "silent" }, limits, inbounds: [{ type: "shadowsocks", tag: "ss", listen: "127.0.0.1", port: 0, method, password }], outbounds: [{ type: "direct", tag: "direct" }], route: { defaultOutbound: "direct", rules: [] } }));
const request = (port: number) => ({ id: "client", inboundTag: "test", protocol: "http" as const, network: "tcp" as const, destination: { host: "127.0.0.1", port, addressType: "ipv4" as const }, startedAt: Date.now() });
