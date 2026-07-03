import assert from "node:assert/strict";
import test from "node:test";
import type { RoutingPolicyConfig } from "../src/config/types.js";
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

void test("transactional mode can reload router only", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["router"],
      defaultOutbound: "block"
    }));
    assert.deepEqual(engine.getLastRuntimeReloadOutcome()?.changedComponents, ["router"]);
    assert.equal(engine.getActiveRouterGeneration().sequence, 1);
    assert.equal(engine.getActivePolicyGeneration().sequence, 0);
  } finally {
    await engine.stop();
  }
});

void test("transactional mode can reload policy only", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["policy"],
      policies: [testPolicy("auto", ["direct", "block"])]
    }));
    assert.deepEqual(engine.getLastRuntimeReloadOutcome()?.changedComponents, ["policy"]);
    assert.equal(engine.getActiveRouterGeneration().sequence, 0);
    assert.equal(engine.getActivePolicyGeneration().sequence, 1);
  } finally {
    await engine.stop();
  }
});

void test("transactional mode atomically reloads router and policy", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["router", "policy"],
      defaultOutbound: "auto",
      policies: [testPolicy("auto", ["block", "direct"])]
    }));
    assert.deepEqual(engine.getLastRuntimeReloadOutcome()?.changedComponents, ["router", "policy"]);
    assert.equal(engine.getActiveRouterGeneration().sequence, 1);
    assert.equal(engine.getActivePolicyGeneration().sequence, 1);
    assert.equal(engine.getRoutingPolicies()[0]?.tag, "auto");
  } finally {
    await engine.stop();
  }
});

void test("transactional mode rejects unsupported data-plane changes", async () => {
  const initial = runtimeConfig();
  const engine = new Engine(initial);
  await engine.start();
  try {
    const candidate = runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: []
    });
    await assert.rejects(engine.reloadConfig({
      ...candidate,
      dns: {
        ...candidate.dns,
        cacheTtlMs: candidate.dns.cacheTtlMs + 1
      }
    }), /only supports metrics\/dashboard\/router\/policy changes/u);
    assert.equal(engine.getMetricsAddress(), null);
  } finally {
    await engine.stop();
  }
});

const testPolicy = (
  tag: string,
  outbounds: readonly string[]
): RoutingPolicyConfig => ({
  tag,
  type: "loadBalance",
  outbounds,
  strategy: "roundRobin",
  unhealthyAfterFailures: 3,
  recoverAfterMs: 30_000
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
