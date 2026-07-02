import assert from "node:assert/strict";
import test from "node:test";
import { Engine } from "../src/core/engine.js";
import { httpRequest, runtimeConfig } from "./fixtures/runtime-reload.js";

const RELOAD_METRICS = [
  "sepigs_reload_total",
  "sepigs_reload_success_total",
  "sepigs_reload_failure_total",
  "sepigs_reload_rollback_total",
  "sepigs_reload_duration_ms",
  "sepigs_reload_component_prepare_duration_ms",
  "sepigs_reload_component_commit_duration_ms",
  "sepigs_reload_component_rollback_total"
] as const;

void test("reload metrics are exposed only after transactional-experimental activation", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true }
  }));
  await engine.start();
  try {
    const legacyBody = (await httpRequest(engine.getMetricsAddress(), "/metrics")).body;
    for (const metric of RELOAD_METRICS) assert.doesNotMatch(legacyBody, new RegExp(metric, "u"));

    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["metrics"],
      metrics: { enabled: true, path: "/transactional-metrics" }
    }));
    const body = (await httpRequest(engine.getMetricsAddress(), "/transactional-metrics")).body;
    for (const metric of RELOAD_METRICS) assert.match(body, new RegExp(metric, "u"));
    assert.match(body, /sepigs_reload_total 1/u);
    assert.match(body, /sepigs_reload_success_total 1/u);
    assert.doesNotMatch(body, /password|authorization|test-only/ui);
  } finally {
    await engine.stop();
  }
});
