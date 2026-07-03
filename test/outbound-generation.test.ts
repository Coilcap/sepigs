import assert from "node:assert/strict";
import test from "node:test";
import type {
  OutboundConfig,
  SepigsConfig
} from "../src/config/types.js";
import {
  OutboundGeneration,
  riskLevelFor
} from "../src/outbound/generation.js";
import { buildOutboundGeneration } from "../src/outbound/generationBuilder.js";
import {
  registerOutboundFactory,
  unregisterOutboundFactory
} from "../src/outbound/registry.js";
import { runtimeConfig } from "./fixtures/runtime-reload.js";

void test("outbound generation metadata and entries are immutable", () => {
  const config = runtimeConfig();
  const generation = generationFrom(config);
  assert.equal(Object.isFrozen(generation), true);
  assert.equal(Object.isFrozen(generation.outboundTags), true);
  assert.equal(Object.isFrozen(generation.registrySnapshot.get("direct")), true);
  assert.throws(() => {
    (generation.registrySnapshot as unknown as Map<string, unknown>).set(
      "new",
      {}
    );
  }, TypeError);
});

void test("outbound generation rejects duplicate tags", () => {
  const config = runtimeConfig();
  assert.throws(
    () =>
      new OutboundGeneration({
        id: "duplicate",
        outbounds: [
          { type: "direct", tag: "same" },
          { type: "block", tag: "same" }
        ],
        defaultOutbound: "same",
        policies: config.route.policies,
        state: "candidate"
      }),
    /duplicate tag/u
  );
});

void test("outbound tag rename is detected as remove plus add", () => {
  const current = runtimeConfig();
  const candidate = withOutbounds(
    current,
    [
      { type: "direct", tag: "renamed-direct" },
      { type: "block", tag: "block" }
    ],
    "renamed-direct"
  );
  const built = buildOutboundGeneration({
    id: "candidate",
    currentOutbounds: current.outbounds,
    candidateConfig: candidate,
    parentGenerationId: "current"
  });
  assert.deepEqual(built.diff.renamed, [
    { from: "direct", to: "renamed-direct", type: "direct" }
  ]);
  assert.deepEqual(built.diff.added, []);
  assert.deepEqual(built.diff.removed, []);
});

void test("outbound risk levels classify core, protocol, and experimental types", () => {
  assert.equal(riskLevelFor("direct"), "low");
  assert.equal(riskLevelFor("block"), "low");
  assert.equal(riskLevelFor("tcpRelay"), "low");
  assert.equal(riskLevelFor("shadowsocks"), "medium");
  assert.equal(riskLevelFor("trojan"), "medium");
  assert.equal(riskLevelFor("wireguard"), "high");
  assert.equal(riskLevelFor("plugin.example"), "high");
});

void test("outbound generation records its parent linkage", () => {
  const config = runtimeConfig();
  const generation = new OutboundGeneration({
    id: "candidate",
    outbounds: config.outbounds,
    defaultOutbound: config.route.defaultOutbound,
    policies: config.route.policies,
    state: "candidate",
    parentGenerationId: "active"
  });
  assert.equal(generation.parentGenerationId, "active");
});

void test("old outbound generation remains readable after candidate construction", () => {
  const current = runtimeConfig();
  const old = generationFrom(current);
  const candidate = withOutbounds(
    current,
    [{ type: "block", tag: "block" }],
    "block"
  );
  buildOutboundGeneration({
    id: "candidate",
    currentOutbounds: current.outbounds,
    candidateConfig: candidate,
    parentGenerationId: old.id
  });
  assert.equal(old.registrySnapshot.get("direct")?.type, "direct");
  assert.equal(old.state, "active");
});

void test("generation builder does not invoke or replace runtime outbound factories", () => {
  let calls = 0;
  registerOutboundFactory(
    "plugin.prototype",
    (config) => {
      calls += 1;
      return {
        tag: config.tag,
        type: config.type,
        connect: () => Promise.reject(new Error("not used")),
        stop: () => Promise.resolve()
      };
    },
    "outbound-generation-test"
  );
  try {
    const current = runtimeConfig();
    const pluginConfig: OutboundConfig = {
      type: "plugin.prototype",
      tag: "plugin",
      options: {}
    };
    const candidate = withOutbounds(current, [pluginConfig], "plugin");
    buildOutboundGeneration({
      id: "candidate",
      currentOutbounds: current.outbounds,
      candidateConfig: candidate
    });
    assert.equal(calls, 0);
  } finally {
    unregisterOutboundFactory(
      "plugin.prototype",
      "outbound-generation-test"
    );
  }
});

const generationFrom = (config: SepigsConfig): OutboundGeneration =>
  new OutboundGeneration({
    id: "active",
    outbounds: config.outbounds,
    defaultOutbound: config.route.defaultOutbound,
    policies: config.route.policies,
    state: "active"
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
