import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { closeSocket } from "../src/utils/net.js";
import { connectClient, getPort, readUntil, startTcpEchoServer, waitFor, waitForSocketClose } from "./helpers.js";

const createEngine = (overrides: Record<string, unknown> = {}): Engine => {
  const config = parseConfig({
    log: { level: "silent" },
    limits: {
      connectTimeoutMs: 250,
      handshakeTimeoutMs: 120,
      idleTimeoutMs: 250,
      shutdownTimeoutMs: 1_000,
      maxHeaderBytes: 64 * 1024,
      maxConnections: 10_000,
      leakReportIntervalMs: 60_000,
      ...overrides
    },
    inbounds: [
      { type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 },
      { type: "socks5", tag: "socks-in", listen: "127.0.0.1", port: 0 }
    ],
    outbounds: [
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" }
    ],
    route: { defaultOutbound: "direct", rules: [] }
  });
  return new Engine(config);
};

void test("ConnectionManager tracks active connections and force closes them", async () => {
  const echo = await startTcpEchoServer();
  const engine = createEngine();
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    await readUntil(client, (buffer) => buffer.includes("200 Connection Established"));
    client.write("managed-ok");
    await readUntil(client, (buffer) => buffer.includes("managed-ok"));

    const active = engine.getActiveConnections();
    assert.equal(active.length, 1);
    const connection = active[0];
    assert.ok(connection);
    assert.equal(connection.protocol, "http");
    assert.equal(connection.destination?.host, "127.0.0.1");
    assert.ok(connection.bytesUpload > 0);
    assert.ok(connection.bytesDownload > 0);

    assert.equal(engine.closeConnection(connection.id, "test force close"), true);
    await waitForSocketClose(client);
    await waitFor(() => engine.getActiveConnections().length === 0);
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
  }
});

void test("ResourceLimiter rejects new connections above maxConnections", async () => {
  const echo = await startTcpEchoServer();
  const engine = createEngine({ maxConnections: 1 });
  await engine.start();
  const first = await connectClient(getPort(engine.getInboundAddress("http-in")));
  const second = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    first.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    await readUntil(first, (buffer) => buffer.includes("200 Connection Established"));

    second.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    const rejected = await readUntil(second, (buffer) => buffer.includes("\r\n\r\n"));
    assert.match(rejected.toString("latin1"), /503 Service Unavailable/u);
    assert.equal(engine.getResourceSnapshot().rejectedConnections, 1);
    assert.equal(engine.getStats().rejectedConnections, 1);
  } finally {
    closeSocket(first);
    closeSocket(second);
    await engine.stop();
    await echo.close();
  }
});

void test("Timeout system recovers partial HTTP handshakes", async () => {
  const engine = createEngine({ handshakeTimeoutMs: 50, idleTimeoutMs: 100 });
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write("CON");
    await waitForSocketClose(client, 1_000);
    await waitFor(() => engine.getActiveConnections().length === 0);
    assert.equal(engine.getStats().failedConnections, 1);
  } finally {
    closeSocket(client);
    await engine.stop();
  }
});

void test("LeakDetector returns to zero tracked sockets and timers after shutdown", async () => {
  const echo = await startTcpEchoServer();
  const engine = createEngine();
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    await readUntil(client, (buffer) => buffer.includes("200 Connection Established"));
    assert.ok(engine.getLeakSnapshot().activeSockets >= 2);
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
  }

  await waitFor(() => engine.getLeakSnapshot().activeSockets === 0 && engine.getLeakSnapshot().activeTimers === 0);
  const snapshot = engine.getLeakSnapshot();
  assert.equal(snapshot.activeSockets, 0);
  assert.equal(snapshot.activeTimers, 0);
});

void test("Fault injection: DNS failure and broken pipe do not leave active connections", async () => {
  const engine = createEngine({ connectTimeoutMs: 200, idleTimeoutMs: 200 });
  await engine.start();
  const dnsFailure = await connectClient(getPort(engine.getInboundAddress("http-in")));
  const brokenPipe = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    dnsFailure.write("CONNECT bad..host:80 HTTP/1.1\r\nHost: bad..host:80\r\n\r\n");
    const response = await readUntil(dnsFailure, (buffer) => buffer.includes("\r\n\r\n"), 2_000);
    assert.match(response.toString("latin1"), /502 Bad Gateway/u);

    brokenPipe.write("CONNECT 127.0.0.1:1 HTTP/1.1\r\nHost: 127.0.0.1:1\r\n\r\n");
    closeSocket(brokenPipe);

    await waitFor(() => engine.getActiveConnections().length === 0, 2_000);
    assert.ok(engine.getStats().failedConnections >= 1);
  } finally {
    closeSocket(dnsFailure);
    closeSocket(brokenPipe);
    await engine.stop();
  }
});
