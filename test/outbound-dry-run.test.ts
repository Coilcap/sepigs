import assert from "node:assert/strict";
import test from "node:test";
import type {
  OutboundConfig,
  SepigsConfig
} from "../src/config/types.js";
import { createOutboundDryRunReport } from "../src/outbound/dryRun.js";
import { runtimeConfig } from "./fixtures/runtime-reload.js";

void test("outbound dry-run reports zero runtime and network side effects", () => {
  const config = runtimeConfig();
  const report = createOutboundDryRunReport(config, config, {
    currentConfigPath: "examples/sepigs.json",
    candidateConfigPath: "examples/sepigs.safe.json"
  });
  assert.deepEqual(report.sideEffects, {
    runtimeMutated: false,
    registryFactoriesInvoked: 0,
    outboundInstancesCreated: 0,
    networkConnectionsOpened: 0,
    listenersOpened: 0,
    connectionsClosed: 0
  });
  assert.equal(report.m11RuntimeAssessment.allowed, true);
});

void test("outbound dry-run redacts secret changes and absolute external paths", () => {
  const current = withOutbound(runtimeConfig(), shadowsocks("old-credential"));
  const candidate = withOutbound(current, shadowsocks("new-credential"));
  const report = createOutboundDryRunReport(current, candidate, {
    currentConfigPath: "/outside/current.json",
    candidateConfigPath: "/outside/candidate.json"
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("old-credential"), false);
  assert.equal(serialized.includes("new-credential"), false);
  assert.ok(serialized.includes("[REDACTED]"));
  assert.equal(report.currentConfigPath, "<external-config>");
  assert.equal(report.candidateConfigPath, "<external-config>");
  assert.equal(report.secretRedaction.status, "passed");
});

void test("outbound dry-run marks protocol outbounds outside M11 limited runtime", () => {
  const current = runtimeConfig();
  const candidate = withOutbound(current, shadowsocks("test-only-password"));
  const report = createOutboundDryRunReport(current, candidate, {
    currentConfigPath: "current.json",
    candidateConfigPath: "candidate.json"
  });
  assert.equal(report.validation.riskSummary.highest, "medium");
  assert.equal(report.m11RuntimeAssessment.allowed, false);
});

void test("outbound dry-run redaction proof covers nested plugin tokens", () => {
  const current = runtimeConfig();
  const plugin: OutboundConfig = {
    type: "plugin.example",
    tag: "plugin",
    options: {
      token: "plugin-token-must-not-leak",
      nested: { password: "nested-password-must-not-leak" }
    }
  };
  const candidate = withOutbound(current, plugin);
  const report = createOutboundDryRunReport(current, candidate, {
    currentConfigPath: "current.json",
    candidateConfigPath: "candidate.json"
  });
  const serialized = JSON.stringify(report);
  assert.equal(serialized.includes("plugin-token-must-not-leak"), false);
  assert.equal(serialized.includes("nested-password-must-not-leak"), false);
  assert.equal(report.secretRedaction.checkedSecretFields, 2);
});

const shadowsocks = (password: string): OutboundConfig => ({
  type: "shadowsocks",
  tag: "ss",
  serverHost: "127.0.0.1",
  serverPort: 8388,
  method: "aes-128-gcm",
  password
});

const withOutbound = (
  config: SepigsConfig,
  outbound: OutboundConfig
): SepigsConfig => ({
  ...config,
  outbounds: [outbound],
  route: {
    ...config.route,
    defaultOutbound: outbound.tag,
    rules: [],
    policies: []
  }
});
