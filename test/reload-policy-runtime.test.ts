import assert from "node:assert/strict";
import test from "node:test";
import type { RoutingPolicyConfig, SepigsConfig } from "../src/config/types.js";
import { Engine } from "../src/core/engine.js";
import {
  RoutingGenerationRuntime,
  createRoutingGenerationPair
} from "../src/router/generation.js";
import { PolicyGeneration } from "../src/router/policyGeneration.js";
import { runtimeConfig } from "./fixtures/runtime-reload.js";

void test("policy transaction publishes a new generation and candidate graph", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    const before = engine.getActivePolicyGeneration();
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["policy"],
      policies: [policy("auto", ["direct", "block"])]
    }));
    assert.equal(engine.getActivePolicyGeneration().sequence, before.sequence + 1);
    assert.deepEqual(engine.getRoutingPolicies()[0], {
      tag: "auto",
      type: "loadBalance",
      strategy: "leastLatency",
      outbounds: ["direct", "block"],
      healthyOutbounds: ["direct", "block"]
    });
  } finally {
    await engine.stop();
  }
});

void test("policy transaction carries health and latency snapshots by value", async () => {
  const initial = runtimeConfig({
    defaultOutbound: "auto",
    policies: [policy("auto", ["direct", "block"])]
  });
  const engine = new Engine(initial);
  await engine.start();
  try {
    const before = engine.getOutboundHealth();
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["policy"],
      defaultOutbound: "auto",
      policies: [{
        ...policy("auto", ["block", "direct"]),
        strategy: "roundRobin"
      }]
    }));
    assert.deepEqual(engine.getOutboundHealth(), before);
    assert.notEqual(engine.getOutboundHealth(), before);
  } finally {
    await engine.stop();
  }
});

void test("invalid policy strategy rolls back without replacing active generation", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    const before = engine.getActivePolicyGeneration();
    const valid = runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["policy"],
      policies: [policy("auto", ["direct", "block"])]
    });
    const invalidPolicy = {
      ...valid.route.policies[0],
      strategy: "invalid"
    } as unknown as RoutingPolicyConfig;
    const invalid: SepigsConfig = {
      ...valid,
      route: {
        ...valid.route,
        policies: [invalidPolicy]
      }
    };
    await assert.rejects(engine.reloadConfig(invalid), /unsupported strategy "invalid"/u);
    assert.deepEqual(engine.getActivePolicyGeneration(), before);
  } finally {
    await engine.stop();
  }
});

void test("invalid policy outbound is rejected before publication", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    const before = engine.getActivePolicyGeneration();
    const valid = runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["policy"],
      policies: [policy("auto", ["direct", "block"])]
    });
    const invalid: SepigsConfig = {
      ...valid,
      route: {
        ...valid.route,
        policies: [policy("auto", ["direct", "missing"])]
      }
    };
    await assert.rejects(engine.reloadConfig(invalid), /unavailable outbound "missing"/u);
    assert.deepEqual(engine.getActivePolicyGeneration(), before);
  } finally {
    await engine.stop();
  }
});

void test("policy health check rejects failover without a fallback and keeps the old generation", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    const before = engine.getActivePolicyGeneration();
    await assert.rejects(engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["policy"],
      policies: [{
        ...policy("failover", ["direct"]),
        type: "failover"
      }]
    })), /has no fallback/u);
    assert.deepEqual(engine.getActivePolicyGeneration(), before);
  } finally {
    await engine.stop();
  }
});

void test("new policy selection changes while an existing decision remains stable", () => {
  const oldPolicy = policy("auto", ["direct", "block"]);
  const oldPair = createRoutingGenerationPair({
    idPrefix: "old-policy-runtime",
    sequence: 0,
    route: route("auto", [oldPolicy]),
    outboundTags: new Set(["direct", "block"])
  });
  const runtime = new RoutingGenerationRuntime(oldPair);
  const existingDecision = oldPair.policyManager.select("auto");
  const candidate = new PolicyGeneration({
    id: "candidate-policy-runtime",
    sequence: 1,
    policies: [{
      ...oldPolicy,
      outbounds: ["block", "direct"]
    }],
    outboundTags: new Set(["direct", "block"])
  });
  runtime.begin("policy-decision-switch", ["policy"]);
  runtime.stagePolicy("policy-decision-switch", candidate);
  runtime.commit("policy-decision-switch", "policy");

  assert.deepEqual(existingDecision.candidates, ["direct", "block"]);
  assert.deepEqual(runtime.active().policyManager.select("auto").candidates, ["block", "direct"]);
});

void test("policy generation validation does not mutate a health source", () => {
  const health = [{
    tag: "direct",
    failures: 0,
    successes: 4,
    latencyEwmaMs: 3
  }];
  const before = structuredClone(health);
  const generation = new PolicyGeneration({
    id: "policy-runtime-no-mutation",
    sequence: 1,
    policies: [policy("auto", ["direct", "block"])],
    outboundTags: new Set(["direct", "block"]),
    healthSnapshot: health
  });
  generation.createManager().recordFailure("direct");
  assert.deepEqual(health, before);
  assert.deepEqual(generation.healthSnapshot, before);
});

void test("legacy policy reload remains on the legacy path", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      policies: [policy("auto", ["direct", "block"])]
    }));
    assert.equal(engine.getLastRuntimeReloadOutcome(), undefined);
    assert.equal(engine.getActivePolicyGeneration().sequence, 1);
  } finally {
    await engine.stop();
  }
});

const policy = (
  tag: string,
  outbounds: readonly string[]
): RoutingPolicyConfig => ({
  tag,
  type: "loadBalance",
  outbounds,
  strategy: "leastLatency",
  unhealthyAfterFailures: 3,
  recoverAfterMs: 30_000
});

const route = (
  defaultOutbound: string,
  policies: readonly RoutingPolicyConfig[]
) => ({
  defaultOutbound,
  rules: [],
  ruleSetFiles: [],
  policies
});
