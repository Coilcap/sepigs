import assert from "node:assert/strict";
import test from "node:test";
import { SystemDnsResolver } from "../src/dns/resolver.js";
import { Logger } from "../src/logger/logger.js";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { closeSocket } from "../src/utils/net.js";
import { connectClient, getPort, readUntil, startTcpEchoServer } from "./helpers.js";

void test("DNS fake-ip answers stay separate from real resolution cache", async () => {
  const resolver = new SystemDnsResolver({ strategy: "system", cacheTtlMs: 60_000, hosts: { "example.test": "192.0.2.2" }, udpServers: [], rules: [], fallbackHosts: {}, fakeIp: { enabled: true, range: "198.18.0.0/24", size: 32, ttlSeconds: 60 }, doh: { enabled: false, endpoints: [], timeoutMs: 1000 } }, new Logger("silent"));
  const fake = await resolver.resolveForClient("example.test");
  assert.equal(resolver.reverseFakeIp(fake), "example.test");
  assert.equal(await resolver.resolve("example.test"), "192.0.2.2");
});

void test("HTTP fake-IP destination is restored before routing and direct DNS", async () => {
  const echo = await startTcpEchoServer();
  const engine = new Engine(parseConfig({ log: { level: "silent" }, dns: { hosts: { "fake.test": "127.0.0.1" }, fakeIp: { enabled: true, range: "198.18.0.0/24", size: 32, ttlSeconds: 60 } }, inbounds: [{ type: "http", tag: "http", listen: "127.0.0.1", port: 0 }], outbounds: [{ type: "direct", tag: "direct" }, { type: "block", tag: "block" }], route: { defaultOutbound: "block", rules: [{ domain: ["fake.test"], outboundTag: "direct" }] } }));
  await engine.start(); const fake = await engine.allocateFakeIp("fake.test"); const client = await connectClient(getPort(engine.getInboundAddress("http")));
  try { client.write(`CONNECT ${fake}:${echo.port} HTTP/1.1\r\nHost: ${fake}:${echo.port}\r\n\r\n`); await readUntil(client, (buffer) => buffer.includes("200 Connection Established")); client.write("fake-route-ok"); assert.match((await readUntil(client, (buffer) => buffer.includes("fake-route-ok"))).toString(), /fake-route-ok/u); }
  finally { closeSocket(client); await engine.stop(); await echo.close(); }
});
