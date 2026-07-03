import assert from "node:assert/strict";
import test from "node:test";
import { Engine } from "../src/core/engine.js";
import { httpRequest, runtimeConfig } from "./fixtures/runtime-reload.js";

void test("experimental metrics expose DNS reload durations, generation, and carry-over", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true }
  }));
  await engine.start();
  try {
    assert.ok((await engine.resolveDns("localhost")).length > 0);
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dns"],
      metrics: { enabled: true },
      dns: { cacheTtlMs: 30_000 }
    }));
    const body = (await httpRequest(engine.getMetricsAddress(), "/metrics")).body;
    assert.match(body, /sepigs_reload_component_prepare_duration_ms\{component="dns"\} \d+/u);
    assert.match(body, /sepigs_reload_component_commit_duration_ms\{component="dns"\} \d+/u);
    assert.match(body, /sepigs_reload_component_rollback_total\{component="dns"\} 0/u);
    assert.match(body, /sepigs_reload_active_dns_generation_id 1/u);
    assert.match(body, /sepigs_reload_dns_generation_draining 0/u);
    assert.match(body, /sepigs_reload_dns_cache_carry_over_total 1/u);
    assert.match(body, /sepigs_reload_dns_cache_dropped_total 0/u);
    assert.doesNotMatch(body, /localhost|dns-query|authorization|password/ui);
  } finally {
    await engine.stop();
  }
});

void test("DNS reload metrics count dropped cache and rejected fake-IP changes", async () => {
  const engine = new Engine(runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["dns"],
    metrics: { enabled: true }
  }));
  await engine.start();
  try {
    assert.ok((await engine.resolveDns("localhost")).length > 0);
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dns"],
      metrics: { enabled: true },
      dns: {
        udpServers: [{
          tag: "changed",
          address: "127.0.0.1",
          port: 9,
          timeoutMs: 20
        }]
      }
    }));
    await assert.rejects(engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dns"],
      metrics: { enabled: true },
      dns: {
        udpServers: [{
          tag: "changed",
          address: "127.0.0.1",
          port: 9,
          timeoutMs: 20
        }],
        fakeIp: { enabled: true }
      }
    })), /fake-IP configuration change/u);
    const body = (await httpRequest(engine.getMetricsAddress(), "/metrics")).body;
    assert.match(body, /sepigs_reload_dns_cache_dropped_total 1/u);
    assert.match(body, /sepigs_reload_dns_rejected_fake_ip_change_total 1/u);
  } finally {
    await engine.stop();
  }
});

void test("legacy metrics omit DNS reload generation metrics", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true }
  }));
  await engine.start();
  try {
    const body = (await httpRequest(engine.getMetricsAddress(), "/metrics")).body;
    assert.doesNotMatch(body, /sepigs_reload_(?:active_dns|dns_)/u);
  } finally {
    await engine.stop();
  }
});
