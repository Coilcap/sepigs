import assert from "node:assert/strict";
import test from "node:test";
import type { SepigsConfig } from "../src/config/types.js";
import { Engine } from "../src/core/engine.js";
import {
  connectClient,
  getPort,
  readBytes,
  readUntil,
  startTcpEchoServer,
  waitFor
} from "./helpers.js";
import { runtimeConfig } from "./fixtures/runtime-reload.js";

void test("router transaction publishes a new generation for new connections", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    const before = engine.getActiveRouterGeneration();
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["router"],
      defaultOutbound: "block"
    }));
    const after = engine.getActiveRouterGeneration();
    assert.notEqual(after.id, before.id);
    assert.equal(after.sequence, before.sequence + 1);
    assert.equal(engine.getLastRuntimeReloadOutcome()?.runtimeSideEffects.routingDecisionChanged, true);
  } finally {
    await engine.stop();
  }
});

void test("router transaction rejects a missing default without replacing active generation", async () => {
  const initial = runtimeConfig();
  const engine = new Engine(initial);
  await engine.start();
  try {
    const before = engine.getActiveRouterGeneration();
    const validCandidate = runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["router"],
      defaultOutbound: "block"
    });
    const invalidCandidate: SepigsConfig = {
      ...validCandidate,
      route: {
        ...validCandidate.route,
        defaultOutbound: "missing"
      }
    };
    await assert.rejects(
      engine.reloadConfig(invalidCandidate),
      /default outbound "missing" is unavailable/u
    );
    assert.deepEqual(engine.getActiveRouterGeneration(), before);
  } finally {
    await engine.stop();
  }
});

void test("router reload keeps an established tunnel alive while new decisions use the candidate", async () => {
  const echo = await startTcpEchoServer();
  const engine = new Engine(runtimeConfig());
  let established: Awaited<ReturnType<typeof connectClient>> | undefined;
  let rejected: Awaited<ReturnType<typeof connectClient>> | undefined;
  await engine.start();
  try {
    const inboundPort = getPort(engine.getInboundAddress("http"));
    established = await openConnectTunnel(inboundPort, echo.port);
    established.write("before");
    assert.equal((await readBytes(established, 6)).toString("utf8"), "before");
    await waitFor(() => engine.getStats().activeConnections === 1);
    const closedBefore = engine.getStats().closedConnections;
    const inboundAddress = engine.getInboundAddress("http");

    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["router"],
      defaultOutbound: "block"
    }));

    assert.deepEqual(engine.getInboundAddress("http"), inboundAddress);
    assert.equal(engine.getStats().closedConnections, closedBefore);
    assert.equal(engine.getStats().activeConnections, 1);
    established.write("after");
    assert.equal((await readBytes(established, 5)).toString("utf8"), "after");

    rejected = await connectClient(inboundPort);
    rejected.write(connectRequest(echo.port));
    const response = await readUntil(rejected, (buffer) => buffer.includes("403 Forbidden"));
    assert.match(response.toString("utf8"), /^HTTP\/1\.1 403 Forbidden/mu);
  } finally {
    established?.destroy();
    rejected?.destroy();
    await engine.stop();
    await echo.close();
  }
  assert.equal(engine.getStats().activeConnections, 0);
  const leaks = engine.getLeakSnapshot();
  assert.equal(leaks.activeSockets, 0);
  assert.equal(leaks.activeTimers, 0);
  assert.equal(leaks.activeListeners, 0);
});

void test("legacy router reload remains on the legacy path", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({ defaultOutbound: "block" }));
    assert.equal(engine.getLastRuntimeReloadOutcome(), undefined);
    assert.equal(engine.getActiveRouterGeneration().sequence, 1);
  } finally {
    await engine.stop();
  }
});

const openConnectTunnel = async (proxyPort: number, targetPort: number) => {
  const socket = await connectClient(proxyPort);
  socket.write(connectRequest(targetPort));
  const response = await readUntil(socket, (buffer) => buffer.includes("\r\n\r\n"));
  assert.match(response.toString("utf8"), /^HTTP\/1\.1 200 Connection Established/mu);
  return socket;
};

const connectRequest = (targetPort: number): string =>
  `CONNECT 127.0.0.1:${String(targetPort)} HTTP/1.1\r\nHost: 127.0.0.1:${String(targetPort)}\r\n\r\n`;
