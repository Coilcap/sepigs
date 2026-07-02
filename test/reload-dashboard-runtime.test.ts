import assert from "node:assert/strict";
import test from "node:test";
import { Engine } from "../src/core/engine.js";
import {
  closeTcpServer,
  httpRequest,
  reserveTcpPort,
  runtimeConfig
} from "./fixtures/runtime-reload.js";

const OLD_TOKEN = "test-only-old-dashboard-token";
const NEW_TOKEN = "test-only-new-dashboard-token";

void test("transactional dashboard reload enables a disabled endpoint", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dashboard"],
      dashboard: { enabled: true, token: NEW_TOKEN }
    }));
    assert.equal((await httpRequest(engine.getDashboardAddress(), "/api/status", NEW_TOKEN)).status, 200);
  } finally {
    await engine.stop();
  }
});

void test("transactional dashboard reload disables an enabled endpoint", async () => {
  const engine = new Engine(runtimeConfig({
    dashboard: { enabled: true, token: OLD_TOKEN }
  }));
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dashboard"]
    }));
    assert.equal(engine.getDashboardAddress(), null);
  } finally {
    await engine.stop();
  }
});

void test("dashboard token changes in place without reopening the listener", async () => {
  const engine = new Engine(runtimeConfig({
    dashboard: { enabled: true, token: OLD_TOKEN }
  }));
  await engine.start();
  const oldAddress = engine.getDashboardAddress();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dashboard"],
      dashboard: { enabled: true, token: NEW_TOKEN }
    }));
    assert.deepEqual(engine.getDashboardAddress(), oldAddress);
    assert.equal((await httpRequest(oldAddress, "/api/status", OLD_TOKEN)).status, 401);
    assert.equal((await httpRequest(oldAddress, "/api/status", NEW_TOKEN)).status, 200);
  } finally {
    await engine.stop();
  }
});

void test("dashboard port conflict rolls back and keeps the old endpoint", async () => {
  const engine = new Engine(runtimeConfig({
    dashboard: { enabled: true, token: OLD_TOKEN }
  }));
  const reservation = await reserveTcpPort();
  await engine.start();
  const oldAddress = engine.getDashboardAddress();
  try {
    await assert.rejects(engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dashboard"],
      dashboard: { enabled: true, port: reservation.port, token: NEW_TOKEN }
    })), /EADDRINUSE|address already in use/u);
    assert.deepEqual(engine.getDashboardAddress(), oldAddress);
    assert.equal((await httpRequest(oldAddress, "/api/status", OLD_TOKEN)).status, 200);
  } finally {
    await engine.stop();
    await closeTcpServer(reservation.server);
  }
});

void test("dashboard reload failure does not stop the running engine", async () => {
  const engine = new Engine(runtimeConfig({
    dashboard: { enabled: true, token: OLD_TOKEN },
    metrics: { enabled: true }
  }));
  const reservation = await reserveTcpPort();
  await engine.start();
  try {
    await assert.rejects(engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dashboard"],
      dashboard: { enabled: true, port: reservation.port, token: NEW_TOKEN },
      metrics: { enabled: true }
    })));
    assert.equal((await httpRequest(engine.getDashboardAddress(), "/api/status", OLD_TOKEN)).status, 200);
    assert.equal((await httpRequest(engine.getMetricsAddress(), "/metrics")).status, 200);
  } finally {
    await engine.stop();
    await closeTcpServer(reservation.server);
  }
});

void test("dashboard config remains redacted after transactional token change", async () => {
  const engine = new Engine(runtimeConfig({
    dashboard: { enabled: true, token: OLD_TOKEN }
  }));
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dashboard"],
      dashboard: { enabled: true, token: NEW_TOKEN }
    }));
    const response = await httpRequest(engine.getDashboardAddress(), "/api/config", NEW_TOKEN);
    assert.equal(response.status, 200);
    assert.doesNotMatch(response.body, new RegExp(`${OLD_TOKEN}|${NEW_TOKEN}`, "u"));
    assert.match(response.body, /REDACTED/u);
  } finally {
    await engine.stop();
  }
});
