import assert from "node:assert/strict";
import test from "node:test";
import { Engine } from "../src/core/engine.js";
import { httpRequest, runtimeConfig } from "./fixtures/runtime-reload.js";

void test("experimental metrics expose outbound reload duration and generation", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true }
  }));
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["outbound"],
      metrics: { enabled: true },
      outbounds: [
        { type: "direct", tag: "direct", connectTimeoutMs: 1_500 },
        { type: "block", tag: "block", reason: "M11 observability test" },
        {
          type: "tcpRelay",
          tag: "relay",
          targetHost: "127.0.0.1",
          targetPort: 9
        }
      ]
    }));
    const body = (await httpRequest(engine.getMetricsAddress(), "/metrics")).body;
    assert.match(
      body,
      /sepigs_reload_component_prepare_duration_ms\{component="outbound-registry"\} \d+/u
    );
    assert.match(
      body,
      /sepigs_reload_component_commit_duration_ms\{component="outbound-registry"\} \d+/u
    );
    assert.match(
      body,
      /sepigs_reload_component_rollback_total\{component="outbound-registry"\} 0/u
    );
    assert.match(body, /sepigs_reload_active_outbound_generation_id 1/u);
    assert.match(body, /sepigs_reload_outbound_generation_draining 0/u);
    assert.match(body, /sepigs_reload_outbound_rejected_unsupported_total 0/u);
    assert.doesNotMatch(body, /password|privateKey|test-only-secret/ui);
  } finally {
    await engine.stop();
  }
});

void test("unsupported outbound rejection increments a redacted metric", async () => {
  const secret = "test-only-secret-must-not-appear";
  const engine = new Engine(runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["outbound"],
    metrics: { enabled: true }
  }));
  await engine.start();
  try {
    await assert.rejects(
      engine.reloadConfig(runtimeConfig({
        mode: "transactional-experimental",
        enabledComponents: ["outbound"],
        metrics: { enabled: true },
        outbounds: [
          { type: "direct", tag: "direct" },
          { type: "block", tag: "block" },
          {
            type: "shadowsocks",
            tag: "unsupported",
            serverHost: "127.0.0.1",
            serverPort: 8388,
            method: "aes-128-gcm",
            password: secret
          }
        ]
      })),
      /rejects unsupported type/u
    );
    const body = (await httpRequest(engine.getMetricsAddress(), "/metrics")).body;
    assert.match(body, /sepigs_reload_outbound_rejected_unsupported_total 1/u);
    assert.doesNotMatch(body, new RegExp(secret, "u"));
  } finally {
    await engine.stop();
  }
});

void test("legacy metrics omit outbound generation metrics", async () => {
  const engine = new Engine(runtimeConfig({
    metrics: { enabled: true }
  }));
  await engine.start();
  try {
    const body = (await httpRequest(engine.getMetricsAddress(), "/metrics")).body;
    assert.doesNotMatch(body, /sepigs_reload_(?:active_outbound|outbound_)/u);
  } finally {
    await engine.stop();
  }
});
