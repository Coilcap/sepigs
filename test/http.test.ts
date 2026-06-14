import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { closeSocket } from "../src/utils/net.js";
import { connectClient, getPort, readUntil, startHttpServer, startTcpEchoServer, waitFor } from "./helpers.js";

const createHttpEngine = (): Engine => {
  const config = parseConfig({
    log: { level: "silent" },
    limits: {
      connectTimeoutMs: 1_000,
      idleTimeoutMs: 1_000,
      shutdownTimeoutMs: 1_000,
      maxHeaderBytes: 64 * 1024
    },
    inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
    outbounds: [
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" }
    ],
    route: { defaultOutbound: "direct", rules: [] }
  });
  return new Engine(config);
};

void test("HTTP inbound supports CONNECT tunneling and releases connection stats", async () => {
  const echo = await startTcpEchoServer();
  const engine = createHttpEngine();
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    const connectResponse = await readUntil(client, (buffer) => buffer.includes("200 Connection Established"));
    assert.match(connectResponse.toString("latin1"), /HTTP\/1\.1 200 Connection Established/u);

    client.write("connect-ok");
    const echoResponse = await readUntil(client, (buffer) => buffer.includes("connect-ok"));
    assert.equal(echoResponse.toString(), "connect-ok");

    client.end();
    await waitFor(() => engine.getStats().activeConnections === 0);
    assert.equal(engine.getStats().totalConnections, 1);
    assert.equal(engine.getStats().closedConnections, 1);
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
  }
});

void test("HTTP inbound forwards absolute-form HTTP requests", async () => {
  const target = await startHttpServer((request, response) => {
    assert.equal(request.url, "/hello?x=1");
    response.writeHead(200, { "Content-Type": "text/plain" });
    response.end("forward-ok");
  });
  const engine = createHttpEngine();
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write(
      `GET http://127.0.0.1:${target.port}/hello?x=1 HTTP/1.1\r\nHost: 127.0.0.1:${target.port}\r\nConnection: close\r\n\r\n`
    );
    const response = await readUntil(client, (buffer) => buffer.includes("forward-ok"));
    assert.match(response.toString("latin1"), /HTTP\/1\.1 200 OK/u);
    assert.match(response.toString("latin1"), /forward-ok/u);
  } finally {
    closeSocket(client);
    await engine.stop();
    await target.close();
  }
});
