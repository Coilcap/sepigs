import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { Logger } from "../src/logger/logger.js";
import { TrojanOutbound } from "../src/outbound/trojan.js";
import { closeSocket } from "../src/utils/net.js";
import { getPort, readUntil, startTcpEchoServer, waitFor } from "./helpers.js";

void test("Trojan plaintext-boundary inbound authenticates and relays TCP", async () => {
  const echo = await startTcpEchoServer(); const engine = new Engine(parseConfig({ log: { level: "silent" }, limits, inbounds: [{ type: "trojan", tag: "trojan", listen: "127.0.0.1", port: 0, password: "secret", tls: { enabled: false } }], outbounds: [{ type: "direct", tag: "direct" }], route: { defaultOutbound: "direct", rules: [] } })); await engine.start();
  const client = new TrojanOutbound({ type: "trojan", tag: "client", serverHost: "127.0.0.1", serverPort: getPort(engine.getInboundAddress("trojan")), password: "secret", tls: { enabled: false, rejectUnauthorized: false } }, limits, new Logger("silent"));
  const connection = await client.connect({ id: "client", inboundTag: "test", protocol: "http", network: "tcp", destination: { host: "127.0.0.1", port: echo.port, addressType: "ipv4" }, startedAt: Date.now() });
  try { connection.socket.write("trojan-inbound-ok"); assert.match((await readUntil(connection.socket, (buffer) => buffer.includes("trojan-inbound-ok"))).toString(), /trojan-inbound-ok/u); }
  finally { closeSocket(connection.socket); await engine.stop(); await echo.close(); }
});
void test("Trojan inbound rejects a wrong password without affecting the engine", async () => { const engine = new Engine(parseConfig({ log: { level: "silent" }, limits, inbounds: [{ type: "trojan", tag: "trojan", listen: "127.0.0.1", port: 0, password: "correct", tls: { enabled: false } }], outbounds: [{ type: "direct", tag: "direct" }], route: { defaultOutbound: "direct", rules: [] } })); await engine.start(); const client = new TrojanOutbound({ type: "trojan", tag: "bad", serverHost: "127.0.0.1", serverPort: getPort(engine.getInboundAddress("trojan")), password: "wrong", tls: { enabled: false, rejectUnauthorized: false } }, limits, new Logger("silent")); const connection = await client.connect({ id: "bad", inboundTag: "test", protocol: "http", network: "tcp", destination: { host: "127.0.0.1", port: 9, addressType: "ipv4" }, startedAt: Date.now() }); connection.socket.on("error", () => undefined); try { await waitFor(() => connection.socket.destroyed && engine.getActiveConnections().length === 0); } finally { closeSocket(connection.socket); await engine.stop(); } });
const limits = { connectTimeoutMs: 500, handshakeTimeoutMs: 500, idleTimeoutMs: 1_000, shutdownTimeoutMs: 1_000, maxHeaderBytes: 65_536, maxConnections: 100, leakReportIntervalMs: 60_000 };
