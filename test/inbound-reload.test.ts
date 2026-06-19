import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { closeSocket } from "../src/utils/net.js";
import { connectClient, getPort, readUntil, startTcpEchoServer } from "./helpers.js";

void test("inbound hot reload starts a new listener before draining the old one", async () => {
  const echo = await startTcpEchoServer();
  const initial = parseConfig({
    log: { level: "silent" },
    limits: { connectTimeoutMs: 500, handshakeTimeoutMs: 500, idleTimeoutMs: 1_000 },
    inbounds: [{ type: "http", tag: "proxy", listen: "127.0.0.1", port: 0 }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });
  const engine = new Engine(initial);
  await engine.start();
  const oldPort = getPort(engine.getInboundAddress("proxy"));
  const oldClient = await connectClient(oldPort);

  try {
    oldClient.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    await readUntil(oldClient, (buffer) => buffer.includes("200 Connection Established"));

    const nextPort = await reservePort();
    const next = parseConfig({
      ...initial,
      inbounds: [{ type: "http", tag: "proxy", listen: "127.0.0.1", port: nextPort }],
      outbounds: [{ type: "direct", tag: "direct" }],
      route: { defaultOutbound: "direct", rules: [] }
    });
    await engine.reloadConfig(next);
    const newPort = getPort(engine.getInboundAddress("proxy"));
    assert.notEqual(newPort, oldPort);
    assert.equal(newPort, nextPort);

    oldClient.write("old-still-alive");
    await readUntil(oldClient, (buffer) => buffer.includes("old-still-alive"));

    const newClient = await connectClient(newPort);
    try {
      newClient.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
      await readUntil(newClient, (buffer) => buffer.includes("200 Connection Established"));
      newClient.write("new-ok");
      await readUntil(newClient, (buffer) => buffer.includes("new-ok"));
    } finally {
      closeSocket(newClient);
    }
  } finally {
    closeSocket(oldClient);
    await engine.stop();
    await echo.close();
  }
});

const reservePort = async (): Promise<number> => {
  const server = await startTcpEchoServer();
  const port = server.port;
  await server.close();
  return port;
};

void test("inbound hot reload rolls back when a new listener fails to start", async () => {
  const initial = parseConfig({
    log: { level: "silent" },
    limits: { connectTimeoutMs: 500, handshakeTimeoutMs: 500, idleTimeoutMs: 1_000 },
    inbounds: [{ type: "http", tag: "proxy", listen: "127.0.0.1", port: 0 }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });
  const engine = new Engine(initial);
  await engine.start();
  const oldPort = getPort(engine.getInboundAddress("proxy"));

  try {
    const bad = parseConfig({
      ...initial,
      inbounds: [
        { type: "http", tag: "proxy", listen: "127.0.0.1", port: oldPort },
        { type: "http", tag: "conflict", listen: "127.0.0.1", port: oldPort }
      ],
      outbounds: [{ type: "direct", tag: "direct" }],
      route: { defaultOutbound: "direct", rules: [] }
    });
    await assert.rejects(
      async () => {
        await engine.reloadConfig(bad);
      },
      /inbound hot reload failed/u
    );
    assert.equal(getPort(engine.getInboundAddress("proxy")), oldPort);
    const client = await connectClient(oldPort);
    closeSocket(client);
  } finally {
    await engine.stop();
  }
});
