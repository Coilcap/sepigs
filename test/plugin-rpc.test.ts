import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { closeSocket } from "../src/utils/net.js";
import { connectClient, getPort, readUntil, startTcpEchoServer } from "./helpers.js";

void test("worker-thread plugin can register a remote outbound factory", async () => {
  const echo = await startTcpEchoServer();
  const engine = new Engine(
    parseConfig({
      log: { level: "silent" },
      plugins: {
        isolation: { mode: "worker-thread", timeoutMs: 1_000 },
        modules: [
          {
            tag: "remote-echo",
            enabled: true,
            path: "plugins/remote-echo-outbound/manifest.json"
          }
        ]
      },
      inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
      outbounds: [{ type: "plugin.remoteEcho", tag: "remote-echo", options: {} }],
      route: { defaultOutbound: "remote-echo", rules: [] }
    })
  );

  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));
  try {
    client.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    await readUntil(client, (buffer) => buffer.includes("200 Connection Established"));
    client.write("remote-rpc-echo");
    const response = await readUntil(client, (buffer) => buffer.includes("remote-rpc-echo"));
    assert.equal(response.toString("utf8"), "remote-rpc-echo");
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
  }
});

void test("remote block outbound fails a single request without crashing the engine", async () => {
  const engine = new Engine(
    parseConfig({
      log: { level: "silent" },
      plugins: {
        isolation: { mode: "worker-thread", timeoutMs: 1_000 },
        modules: [
          {
            tag: "remote-block",
            enabled: true,
            path: "plugins/remote-block-outbound/manifest.json"
          }
        ]
      },
      inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
      outbounds: [{ type: "plugin.remoteBlock", tag: "remote-block", options: {} }],
      route: { defaultOutbound: "remote-block", rules: [] }
    })
  );

  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));
  try {
    client.write("CONNECT 127.0.0.1:1 HTTP/1.1\r\nHost: 127.0.0.1:1\r\n\r\n");
    const response = await readUntil(client, (buffer) => buffer.includes("\r\n\r\n"));
    assert.match(response.toString("latin1"), /^HTTP\/1\.1 403/u);
    assert.equal(engine.getStats().outboundFailuresTotal, 1);
  } finally {
    closeSocket(client);
    await engine.stop();
  }
});

void test("isolated remote factory registration enforces outbound permission", async () => {
  const engine = new Engine(
    parseConfig({
      log: { level: "silent" },
      plugins: {
        isolation: { mode: "worker-thread", timeoutMs: 1_000 },
        modules: [
          {
            tag: "remote-denied",
            enabled: true,
            path: "plugins/remote-denied-outbound/manifest.json"
          }
        ]
      },
      inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
      outbounds: [{ type: "plugin.remoteDenied", tag: "denied", options: {} }],
      route: { defaultOutbound: "denied", rules: [] }
    })
  );

  await assert.rejects(async () => {
    await engine.start();
  }, /outbound:register/u);
  await engine.stop();
});
