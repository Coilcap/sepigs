import assert from "node:assert/strict";
import test from "node:test";
import { Engine } from "../src/core/engine.js";
import {
  closeTcpServer,
  httpRequest,
  reserveTcpPort,
  runtimeConfig
} from "./fixtures/runtime-reload.js";

void test("transactional metrics reload updates path without replacing the same listener", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true, path: "/old-metrics" }
  }));
  await engine.start();
  const oldAddress = engine.getMetricsAddress();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["metrics"],
      metrics: { enabled: true, path: "/new-metrics" }
    }));
    assert.deepEqual(engine.getMetricsAddress(), oldAddress);
    assert.equal((await httpRequest(engine.getMetricsAddress(), "/old-metrics")).status, 404);
    assert.equal((await httpRequest(engine.getMetricsAddress(), "/new-metrics")).status, 200);
  } finally {
    await engine.stop();
  }
});

void test("metrics port conflict rolls back and leaves the old server available", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true, path: "/old-metrics" }
  }));
  const reservation = await reserveTcpPort();
  await engine.start();
  const oldAddress = engine.getMetricsAddress();
  try {
    await assert.rejects(
      engine.reloadConfig(runtimeConfig({
        mode: "transactional-experimental",
        enabledComponents: ["metrics"],
        metrics: { enabled: true, port: reservation.port, path: "/new-metrics" }
      })),
      /EADDRINUSE|address already in use/u
    );
    assert.deepEqual(engine.getMetricsAddress(), oldAddress);
    assert.equal((await httpRequest(oldAddress, "/old-metrics")).status, 200);
  } finally {
    await engine.stop();
    await closeTcpServer(reservation.server);
  }
});

void test("transactional metrics reload enables a disabled endpoint", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    assert.equal(engine.getMetricsAddress(), null);
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["metrics"],
      metrics: { enabled: true }
    }));
    assert.equal((await httpRequest(engine.getMetricsAddress(), "/metrics")).status, 200);
  } finally {
    await engine.stop();
  }
});

void test("transactional metrics reload disables an enabled endpoint", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true }
  }));
  await engine.start();
  try {
    assert.notEqual(engine.getMetricsAddress(), null);
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["metrics"]
    }));
    assert.equal(engine.getMetricsAddress(), null);
  } finally {
    await engine.stop();
  }
});

void test("a later dashboard prepare failure keeps the old metrics server alive", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true, path: "/old-metrics" }
  }));
  const reservation = await reserveTcpPort();
  await engine.start();
  const oldAddress = engine.getMetricsAddress();
  try {
    await assert.rejects(engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["metrics", "dashboard"],
      metrics: { enabled: true, path: "/candidate-metrics" },
      dashboard: {
        enabled: true,
        port: reservation.port,
        token: "test-only-dashboard-token"
      }
    })), /EADDRINUSE|address already in use/u);
    assert.deepEqual(engine.getMetricsAddress(), oldAddress);
    assert.equal((await httpRequest(oldAddress, "/old-metrics")).status, 200);
    assert.equal((await httpRequest(oldAddress, "/candidate-metrics")).status, 404);
  } finally {
    await engine.stop();
    await closeTcpServer(reservation.server);
  }
});

void test("failed metrics candidate cleanup releases its probed target port", async () => {
  const candidateReservation = await reserveTcpPort();
  const candidatePort = candidateReservation.port;
  await closeTcpServer(candidateReservation.server);
  const conflict = await reserveTcpPort();
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true, path: "/old-metrics" }
  }));
  await engine.start();
  try {
    await assert.rejects(engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["metrics", "dashboard"],
      metrics: { enabled: true, port: candidatePort, path: "/candidate-metrics" },
      dashboard: {
        enabled: true,
        port: conflict.port,
        token: "test-only-dashboard-token"
      }
    })), /EADDRINUSE|address already in use/u);
    const available = await reserveSpecificPort(candidatePort);
    await closeTcpServer(available);
  } finally {
    await engine.stop();
    await closeTcpServer(conflict.server);
  }
});

const reserveSpecificPort = async (port: number) => {
  const { createServer } = await import("node:net");
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
    server.listen(port, "127.0.0.1");
  });
  return server;
};
