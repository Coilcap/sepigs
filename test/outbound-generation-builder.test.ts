import assert from "node:assert/strict";
import test from "node:test";
import type {
  OutboundConfig,
  SepigsConfig
} from "../src/config/types.js";
import {
  buildOutboundGeneration,
  diffOutboundConfigs
} from "../src/outbound/generationBuilder.js";
import { runtimeConfig } from "./fixtures/runtime-reload.js";

void test("builder identifies added, removed, and modified outbounds", () => {
  const current = runtimeConfig();
  const candidate = configWith(
    current,
    [
      { type: "direct", tag: "direct", connectTimeoutMs: 250 },
      {
        type: "tcpRelay",
        tag: "relay",
        targetHost: "127.0.0.1",
        targetPort: 9000
      }
    ],
    "direct"
  );
  const result = buildOutboundGeneration({
    id: "candidate",
    currentOutbounds: current.outbounds,
    candidateConfig: candidate
  });
  assert.deepEqual(result.diff.added, ["relay"]);
  assert.deepEqual(result.diff.removed, ["block"]);
  assert.deepEqual(result.diff.modified, [
    { tag: "direct", changedFields: ["connectTimeoutMs"] }
  ]);
});

void test("builder distinguishes type and target changes", () => {
  const current = configWith(
    runtimeConfig(),
    [{
      type: "tcpRelay",
      tag: "edge",
      targetHost: "old.test",
      targetPort: 1000
    }],
    "edge"
  );
  const candidate = configWith(
    current,
    [{
      type: "tcpRelay",
      tag: "edge",
      targetHost: "new.test",
      targetPort: 2000
    }],
    "edge"
  );
  const targetDiff = diffOutboundConfigs(
    current.outbounds,
    candidate.outbounds,
    candidate
  );
  assert.deepEqual(targetDiff.targetChanged, ["edge"]);

  const changedType = configWith(
    current,
    [{ type: "block", tag: "edge" }],
    "edge"
  );
  assert.deepEqual(
    diffOutboundConfigs(current.outbounds, changedType.outbounds, changedType)
      .typeChanged,
    ["edge"]
  );
});

void test("builder detects secret changes without exposing values", () => {
  const current = configWith(
    runtimeConfig(),
    [shadowsocks("old-password")],
    "ss"
  );
  const candidate = configWith(
    current,
    [shadowsocks("new-password")],
    "ss"
  );
  const result = buildOutboundGeneration({
    id: "candidate",
    currentOutbounds: current.outbounds,
    candidateConfig: candidate
  });
  assert.deepEqual(result.diff.secretChanged, ["ss"]);
  assert.deepEqual(result.diff.modified[0]?.changedFields, [
    "password:[REDACTED]"
  ]);
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("old-password"), false);
  assert.equal(serialized.includes("new-password"), false);
});

void test("builder records policy references and missing targets", () => {
  const current = runtimeConfig();
  const candidate: SepigsConfig = {
    ...current,
    route: {
      ...current.route,
      defaultOutbound: "direct",
      policies: [{
        tag: "failover",
        type: "failover",
        strategy: "roundRobin",
        outbounds: ["direct", "missing"],
        unhealthyAfterFailures: 2,
        recoverAfterMs: 1_000
      }]
    }
  };
  const diff = diffOutboundConfigs(
    current.outbounds,
    candidate.outbounds,
    candidate
  );
  assert.deepEqual(diff.policyReferencedTags.direct, [
    "default",
    "policy:failover"
  ]);
  assert.deepEqual(diff.missingPolicyReferences, ["missing"]);
});

void test("builder carries health snapshots by value", () => {
  const current = runtimeConfig();
  const health = [{
    tag: "direct",
    failures: 1,
    successes: 4,
    latencyEwmaMs: 12
  }];
  const result = buildOutboundGeneration({
    id: "candidate",
    currentOutbounds: current.outbounds,
    candidateConfig: current,
    healthSnapshot: health
  });
  assert.deepEqual(result.generation.healthSnapshot, health);
  health[0] = {
    tag: "direct",
    failures: 9,
    successes: 4,
    latencyEwmaMs: 12
  };
  assert.equal(result.generation.healthSnapshot[0]?.failures, 1);
});

const shadowsocks = (password: string): OutboundConfig => ({
  type: "shadowsocks",
  tag: "ss",
  serverHost: "127.0.0.1",
  serverPort: 8388,
  method: "aes-128-gcm",
  password
});

const configWith = (
  config: SepigsConfig,
  outbounds: readonly OutboundConfig[],
  defaultOutbound: string
): SepigsConfig => ({
  ...config,
  outbounds,
  route: {
    ...config.route,
    defaultOutbound,
    rules: []
  }
});
