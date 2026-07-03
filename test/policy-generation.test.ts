import assert from "node:assert/strict";
import test from "node:test";
import {
  RoutingGenerationRuntime,
  createRoutingGenerationPair
} from "../src/router/generation.js";
import { PolicyGeneration } from "../src/router/policyGeneration.js";
import type { OutboundHealthSnapshot } from "../src/router/policy.js";

const outbounds = new Set(["fast", "slow", "direct"]);
const health: readonly OutboundHealthSnapshot[] = [
  {
    tag: "fast",
    failures: 0,
    successes: 5,
    latencyEwmaMs: 8
  },
  {
    tag: "slow",
    failures: 1,
    successes: 2,
    lastFailureAt: 100,
    latencyEwmaMs: 80
  }
];

void test("policy generation builds an immutable graph", () => {
  const generation = createPolicy("policy-1", 1, health);
  assert.equal(Object.isFrozen(generation), true);
  assert.equal(Object.isFrozen(generation.policies), true);
  assert.equal(Object.isFrozen(generation.policies[0]), true);
  assert.deepEqual(generation.policies[0]?.outbounds, ["fast", "slow"]);
});

void test("policy generation carries health and latency snapshots by value", () => {
  const generation = createPolicy("policy-1", 1, health);
  assert.deepEqual(generation.healthSnapshot, health);
  assert.deepEqual(generation.latencySnapshot, [
    { tag: "fast", latencyEwmaMs: 8 },
    { tag: "slow", latencyEwmaMs: 80 }
  ]);
  assert.equal(generation.createManager().select("auto").candidates[0], "fast");
});

void test("policy snapshot creation and runtime updates do not mutate source health", () => {
  const before = structuredClone(health);
  const generation = createPolicy("policy-1", 1, health);
  const manager = generation.createManager();
  manager.recordFailure("fast");
  manager.recordSuccess("slow", 2);
  assert.deepEqual(health, before);
  assert.deepEqual(generation.healthSnapshot, before);
});

void test("policy rollback restores the old combined generation", () => {
  const old = createRoutingGenerationPair({
    idPrefix: "old",
    sequence: 0,
    route: routeConfig([]),
    outboundTags: outbounds
  });
  const runtime = new RoutingGenerationRuntime(old);
  const candidate = createPolicy("candidate-policy", 1, health);
  runtime.begin("tx", ["policy"]);
  runtime.stagePolicy("tx", candidate);
  runtime.commit("tx", "policy");
  assert.equal(runtime.active().policy.id, "candidate-policy");
  runtime.rollback("tx");
  assert.equal(runtime.active().policy, old.policy);
});

void test("invalid policy candidates are rejected before commit", () => {
  assert.throws(() => new PolicyGeneration({
    id: "invalid",
    sequence: 1,
    policies: [{
      tag: "auto",
      type: "failover",
      outbounds: ["missing"],
      strategy: "roundRobin",
      unhealthyAfterFailures: 1,
      recoverAfterMs: 1_000
    }],
    outboundTags: outbounds
  }), /unavailable outbound "missing"/u);
});

const createPolicy = (
  id: string,
  sequence: number,
  healthSnapshot: readonly OutboundHealthSnapshot[]
): PolicyGeneration => new PolicyGeneration({
  id,
  sequence,
  policies: [{
    tag: "auto",
    type: "loadBalance",
    outbounds: ["fast", "slow"],
    strategy: "leastLatency",
    unhealthyAfterFailures: 2,
    recoverAfterMs: 30_000
  }],
  outboundTags: outbounds,
  healthSnapshot
});

const routeConfig = (policies: ReturnType<typeof createPolicy>["policies"]) => ({
  defaultOutbound: "direct",
  rules: [],
  ruleSetFiles: [],
  policies
});
