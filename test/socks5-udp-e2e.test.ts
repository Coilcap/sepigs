import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { closeSocket } from "../src/utils/net.js";
import { connectClient, getPort, readBytes, sendUdpAndRead, startUdpEchoServer, waitFor } from "./helpers.js";
import { parseSocksUdpPacket } from "../src/inbound/socks5Udp.js";

void test("SOCKS5 UDP survives route reload, restores fake-IP, records metrics, and cleans up", async () => {
  const echo = await startUdpEchoServer();
  const base = { log: { level: "silent" }, limits: { udpIdleTimeoutMs: 1_000, maxUdpSessions: 4 }, dns: { hosts: { "udp-fake.test": "127.0.0.1" }, fakeIp: { enabled: true, range: "198.18.0.0/24", size: 16, ttlSeconds: 60 } }, inbounds: [{ type: "socks5", tag: "socks", listen: "127.0.0.1", port: 0, udpAssociate: true }], outbounds: [{ type: "direct", tag: "direct" }, { type: "block", tag: "block" }], route: { defaultOutbound: "direct", rules: [] } } as const;
  const engine = new Engine(parseConfig(base)); await engine.start(); const control = await connectClient(getPort(engine.getInboundAddress("socks")));
  try {
    control.write(Buffer.from([5, 1, 0])); assert.deepEqual([...(await readBytes(control, 2)).subarray(0, 2)], [5, 0]);
    control.write(Buffer.from([5, 3, 0, 1, 0, 0, 0, 0, 0, 0])); const reply = await readBytes(control, 10); const relayPort = ((reply[8] ?? 0) << 8) + (reply[9] ?? 0);
    const fake = await engine.allocateFakeIp("udp-fake.test"); const octets = fake.split(".").map(Number);
    const packetFor = (payload: string): Buffer => Buffer.concat([Buffer.from([0, 0, 0, 1, ...octets, (echo.port >> 8) & 0xff, echo.port & 0xff]), Buffer.from(payload)]);
    const send = async (payload: string): Promise<void> => { const response = parseSocksUdpPacket(await sendUdpAndRead(relayPort, "127.0.0.1", packetFor(payload))); assert.equal(response.payload.toString(), payload); };
    await send("before-reload").catch((error: unknown) => { throw new Error(`before reload: ${error instanceof Error ? error.message : String(error)}`); });
    await engine.reloadConfig(parseConfig({ ...base, route: { defaultOutbound: "direct", rules: [{ port: [1], outboundTag: "block" }] } }));
    await send("after-reload").catch((error: unknown) => { throw new Error(`after reload: ${error instanceof Error ? error.message : String(error)}`); });
    await engine.reloadConfig(parseConfig({ ...base, route: { defaultOutbound: "direct", rules: [{ port: [echo.port], outboundTag: "block" }] } }));
    await assert.rejects(sendUdpAndRead(relayPort, "127.0.0.1", packetFor("blocked"), 100), /timed out waiting for UDP response/u);
    await waitFor(() => (engine.getStats().udpErrorsTotal ?? 0) === 1);
    const stats = engine.getStats(); assert.equal(stats.udpSessionsActive, 1); assert.equal(stats.udpPacketsClientToRemote, 3); assert.equal(stats.udpPacketsRemoteToClient, 2); assert.equal(stats.udpErrorsTotal, 1);
    control.end(); await waitFor(() => (engine.getStats().udpSessionsActive ?? -1) === 0);
  } finally { closeSocket(control); await engine.stop(); await echo.close(); }
  assert.deepEqual(engine.getLeakSnapshot(), { activeSockets: 0, activeTimers: 0, activeListeners: 0, trackedEmitters: 0, warnings: [] });
});
