import assert from "node:assert/strict";
import test from "node:test";
import { BlockOutbound } from "../src/outbound/block.js";
import { DirectOutbound } from "../src/outbound/direct.js";
import { TcpRelayOutbound } from "../src/outbound/tcpRelay.js";
import type { LimitConfig } from "../src/config/types.js";
import type { ProxyRequest } from "../src/protocol/types.js";
import { Logger } from "../src/logger/logger.js";
import { OutboundBlockedError } from "../src/utils/errors.js";
import { closeSocket, makeDestination } from "../src/utils/net.js";
import { readUntil, startTcpEchoServer } from "./helpers.js";

const limits: LimitConfig = {
  connectTimeoutMs: 1_000,
  handshakeTimeoutMs: 1_000,
  idleTimeoutMs: 1_000,
  shutdownTimeoutMs: 1_000,
  maxHeaderBytes: 64 * 1024,
  maxConnections: 10_000,
  leakReportIntervalMs: 60_000
};

const logger = new Logger("silent");

const request = (host: string, port: number): ProxyRequest => ({
  id: "outbound-test",
  inboundTag: "test-in",
  protocol: "http",
  network: "tcp",
  destination: makeDestination(host, port),
  startedAt: Date.now()
});

void test("DirectOutbound opens a TCP connection to the requested destination", async () => {
  const echo = await startTcpEchoServer();
  const outbound = new DirectOutbound({ type: "direct", tag: "direct" }, limits, logger);

  try {
    const connection = await outbound.connect(request("127.0.0.1", echo.port));
    connection.socket.write("direct-ok");
    const response = await readUntil(connection.socket, (buffer) => buffer.includes("direct-ok"));
    assert.equal(response.toString(), "direct-ok");
    closeSocket(connection.socket);
  } finally {
    await echo.close();
  }
});

void test("BlockOutbound rejects connections with a typed error", async () => {
  const outbound = new BlockOutbound({ type: "block", tag: "block" });
  await assert.rejects(async () => await outbound.connect(request("example.com", 80)), OutboundBlockedError);
});

void test("TcpRelayOutbound connects to its configured relay target", async () => {
  const echo = await startTcpEchoServer();
  const outbound = new TcpRelayOutbound(
    { type: "tcpRelay", tag: "relay", targetHost: "127.0.0.1", targetPort: echo.port },
    limits,
    logger
  );

  try {
    const connection = await outbound.connect(request("203.0.113.10", 1234));
    connection.socket.write("relay-ok");
    const response = await readUntil(connection.socket, (buffer) => buffer.includes("relay-ok"));
    assert.equal(response.toString(), "relay-ok");
    closeSocket(connection.socket);
  } finally {
    await echo.close();
  }
});
