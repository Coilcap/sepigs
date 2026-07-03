import assert from "node:assert/strict";
import test from "node:test";
import type {
  OutboundConfig,
  SepigsConfig
} from "../src/config/types.js";
import { createOutboundShadowReport } from "../src/outbound/shadow.js";
import { runtimeConfig } from "./fixtures/runtime-reload.js";

void test("shadow keeps an old connection reference and selects candidate for a new connection", () => {
  const current = runtimeConfig();
  const candidate = withOutbounds(
    current,
    [
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" }
    ],
    "block"
  );
  const report = shadow(current, candidate);
  assert.equal(report.oldConnection.generationId, "outbound-shadow-current-0");
  assert.equal(report.oldConnection.retainedOldReference, true);
  assert.equal(report.newConnection.generationId, "outbound-shadow-candidate-1");
  assert.equal(report.newConnection.outboundTag, "block");
  assert.equal(report.newConnection.wouldUseCandidate, true);
  assert.deepEqual(report.finalReferenceCounts, { current: 0, candidate: 0 });
});

void test("shadow warns when removed outbound has an active old reference", () => {
  const current = runtimeConfig();
  const candidate = withOutbounds(
    current,
    [{ type: "block", tag: "block" }],
    "block"
  );
  const report = shadow(current, candidate);
  assert.equal(report.activeReferenceWarnings.length, 1);
  assert.match(report.activeReferenceWarnings[0] ?? "", /cannot be force-closed/u);
});

void test("shadow rejects candidate with missing policy outbound", () => {
  const current = runtimeConfig();
  const candidate: SepigsConfig = {
    ...current,
    route: {
      ...current.route,
      policies: [{
        tag: "bad-policy",
        type: "failover",
        strategy: "roundRobin",
        outbounds: ["missing"],
        unhealthyAfterFailures: 1,
        recoverAfterMs: 100
      }]
    }
  };
  const report = shadow(current, candidate);
  assert.equal(report.candidateAccepted, false);
  assert.equal(report.newConnection.wouldUseCandidate, false);
  assert.ok(
    report.dryRun.validation.errors.some(
      (issue) => issue.code === "missing-policy-outbound"
    )
  );
});

void test("shadow does not mutate runtime, registry, network, DNS, or fake-IP", () => {
  const config = runtimeConfig();
  const before = JSON.stringify(config);
  const report = shadow(config, config);
  assert.deepEqual(report.sideEffects, {
    runtimeMutated: false,
    activeRegistryReplaced: false,
    productionEngineInvoked: false,
    registryFactoriesInvoked: 0,
    outboundInstancesCreated: 0,
    networkConnectionsOpened: 0,
    listenersOpened: 0,
    connectionsClosed: 0,
    dnsMutated: false,
    fakeIpMutated: false
  });
  assert.equal(JSON.stringify(config), before);
});

const shadow = (
  current: SepigsConfig,
  candidate: SepigsConfig
) =>
  createOutboundShadowReport(current, candidate, {
    currentConfigPath: "current.json",
    candidateConfigPath: "candidate.json"
  });

const withOutbounds = (
  config: SepigsConfig,
  outbounds: readonly OutboundConfig[],
  defaultOutbound: string
): SepigsConfig => ({
  ...config,
  outbounds,
  route: {
    ...config.route,
    defaultOutbound,
    rules: [],
    policies: []
  }
});
