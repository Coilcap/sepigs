import assert from "node:assert/strict";
import test from "node:test";
import { Engine } from "../src/core/engine.js";
import { httpRequest, runtimeConfig } from "./fixtures/runtime-reload.js";

void test("legacy mode keeps the existing reload path", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true, path: "/old-metrics" }
  }));
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      metrics: { enabled: true, path: "/legacy-metrics" }
    }));
    assert.equal((await httpRequest(engine.getMetricsAddress(), "/legacy-metrics")).status, 200);
    assert.equal(engine.getLastRuntimeReloadOutcome(), undefined);
  } finally {
    await engine.stop();
  }
});

void test("transactional mode can reload metrics only", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["metrics"],
      metrics: { enabled: true }
    }));
    assert.deepEqual(engine.getLastRuntimeReloadOutcome()?.changedComponents, ["metrics"]);
  } finally {
    await engine.stop();
  }
});

void test("transactional mode can reload dashboard only", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dashboard"],
      dashboard: { enabled: true, token: "test-only-dashboard-token" }
    }));
    assert.deepEqual(engine.getLastRuntimeReloadOutcome()?.changedComponents, ["dashboard"]);
  } finally {
    await engine.stop();
  }
});

void test("transactional mode rejects unsupported data-plane changes", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await assert.rejects(engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["metrics"],
      metrics: { enabled: true },
      routeSuffix: "blocked.example"
    })), /only supports metrics\/dashboard changes/u);
    assert.equal(engine.getMetricsAddress(), null);
  } finally {
    await engine.stop();
  }
});

void test("transactional failure does not invoke legacy fallback or kill runtime", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true, path: "/old-metrics" }
  }));
  await engine.start();
  try {
    await assert.rejects(engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: [],
      metrics: { enabled: true, path: "/new-metrics" }
    })), /not enabled/u);
    assert.equal((await httpRequest(engine.getMetricsAddress(), "/old-metrics")).status, 200);
    assert.equal((await httpRequest(engine.getMetricsAddress(), "/new-metrics")).status, 404);
  } finally {
    await engine.stop();
  }
});
