import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { closeSocket } from "../src/utils/net.js";
import { connectClient, getPort, readBytes, readUntil, sendUdpAndRead, startTcpEchoServer, startUdpEchoServer } from "./helpers.js";

const createSocksEngine = (): Engine => {
  const config = parseConfig({
    log: { level: "silent" },
    limits: {
      connectTimeoutMs: 1_000,
      idleTimeoutMs: 1_000,
      shutdownTimeoutMs: 1_000,
      maxHeaderBytes: 64 * 1024
    },
    inbounds: [{ type: "socks5", tag: "socks-in", listen: "127.0.0.1", port: 0, udpAssociate: true }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });
  return new Engine(config);
};

void test("SOCKS5 inbound supports no-auth CONNECT", async () => {
  const echo = await startTcpEchoServer();
  const engine = createSocksEngine();
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("socks-in")));

  try {
    client.write(Buffer.from([0x05, 0x01, 0x00]));
    const greeting = await readBytes(client, 2);
    assert.deepEqual([...greeting.subarray(0, 2)], [0x05, 0x00]);

    const portHigh = (echo.port >> 8) & 0xff;
    const portLow = echo.port & 0xff;
    client.write(Buffer.from([0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1, portHigh, portLow]));
    const reply = await readBytes(client, 10);
    assert.deepEqual([...reply.subarray(0, 2)], [0x05, 0x00]);

    client.write("socks-ok");
    const response = await readUntil(client, (buffer) => buffer.includes("socks-ok"));
    assert.equal(response.toString(), "socks-ok");
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
  }
});

void test("SOCKS5 inbound relays UDP ASSOCIATE packets through direct outbound", async () => {
  const echo = await startUdpEchoServer();
  const engine = createSocksEngine();
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("socks-in")));

  try {
    client.write(Buffer.from([0x05, 0x01, 0x00]));
    const greeting = await readBytes(client, 2);
    assert.deepEqual([...greeting.subarray(0, 2)], [0x05, 0x00]);

    client.write(Buffer.from([0x05, 0x03, 0x00, 0x01, 0, 0, 0, 0, 0, 0]));
    const reply = await readBytes(client, 10);
    assert.deepEqual([...reply.subarray(0, 2)], [0x05, 0x00]);
    const udpPort = ((reply[8] ?? 0) << 8) + (reply[9] ?? 0);

    const targetPortHigh = (echo.port >> 8) & 0xff;
    const targetPortLow = echo.port & 0xff;
    const socksUdpPacket = Buffer.concat([
      Buffer.from([0x00, 0x00, 0x00, 0x01, 127, 0, 0, 1, targetPortHigh, targetPortLow]),
      Buffer.from("udp-ok")
    ]);

    const response = await sendUdpAndRead(udpPort, "127.0.0.1", socksUdpPacket);
    assert.equal(response.subarray(10).toString(), "udp-ok");

    client.end();
    await new Promise((resolve) => {
      setTimeout(resolve, 30);
    });
    const stats = engine.getStats();
    assert.equal(stats.udpPacketsClientToRemote, 1);
    assert.equal(stats.udpPacketsRemoteToClient, 1);
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
  }
});
