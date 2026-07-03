import assert from "node:assert/strict";
import test from "node:test";
import type { RoutingPolicyConfig, SepigsConfig } from "../src/config/types.js";
import { Engine } from "../src/core/engine.js";
import { httpRequest, runtimeConfig } from "./fixtures/runtime-reload.js";

void test("experimental metrics expose router and policy transaction durations and active generations", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true }
  }));
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["router", "policy"],
      metrics: { enabled: true },
      defaultOutbound: "auto",
      policies: [policy(["direct", "block"])]
    }));
    const body = (await httpRequest(engine.getMetricsAddress(), "/metrics")).body;
    assert.match(body, /sepigs_reload_component_prepare_duration_ms\{component="router"\} \d+/u);
    assert.match(body, /sepigs_reload_component_prepare_duration_ms\{component="policy-prober"\} \d+/u);
    assert.match(body, /sepigs_reload_component_commit_duration_ms\{component="router"\} \d+/u);
    assert.match(body, /sepigs_reload_component_commit_duration_ms\{component="policy-prober"\} \d+/u);
    assert.match(body, /sepigs_reload_active_router_generation_id 1/u);
    assert.match(body, /sepigs_reload_active_policy_generation_id 1/u);
    assert.doesNotMatch(body, /blocked\.example|test-only|authorization/ui);
  } finally {
    await engine.stop();
  }
});

void test("router rollback metrics are visible after a later policy prepare failure", async () => {
  const engine = new Engine(runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["router", "policy"],
    metrics: { enabled: true },
    defaultOutbound: "auto",
    policies: [policy(["direct", "block"])]
  }));
  await engine.start();
  try {
    const valid = runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["router", "policy"],
      metrics: { enabled: true },
      routeSuffix: "blocked.example",
      defaultOutbound: "auto",
      policies: [policy(["direct", "block"])]
    });
    const invalid: SepigsConfig = {
      ...valid,
      route: {
        ...valid.route,
        policies: [policy(["direct", "missing"])]
      }
    };
    await assert.rejects(engine.reloadConfig(invalid), /unavailable outbound "missing"/u);
    const body = (await httpRequest(engine.getMetricsAddress(), "/metrics")).body;
    assert.match(body, /sepigs_reload_rollback_total 1/u);
    assert.match(body, /sepigs_reload_component_rollback_total\{component="router"\} 1/u);
    assert.match(body, /sepigs_reload_active_router_generation_id 0/u);
    assert.match(body, /sepigs_reload_active_policy_generation_id 0/u);
  } finally {
    await engine.stop();
  }
});

void test("legacy metrics omit routing generation identifiers", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true }
  }));
  await engine.start();
  try {
    const body = (await httpRequest(engine.getMetricsAddress(), "/metrics")).body;
    assert.doesNotMatch(body, /sepigs_reload_active_(?:router|policy)_generation_id/u);
  } finally {
    await engine.stop();
  }
});

const policy = (outbounds: readonly string[]): RoutingPolicyConfig => ({
  tag: "auto",
  type: "loadBalance",
  outbounds,
  strategy: "leastLatency",
  unhealthyAfterFailures: 3,
  recoverAfterMs: 30_000
});
