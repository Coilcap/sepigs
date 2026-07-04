import assert from "node:assert/strict";
import test from "node:test";
import type { OutboundConfig, SepigsConfig } from "../src/config/types.js";
import { Engine } from "../src/core/engine.js";
import { OutboundGeneration } from "../src/outbound/generation.js";
import type { Outbound } from "../src/outbound/outbound.js";
import { OutboundRuntimeRegistry } from "../src/outbound/runtimeRegistry.js";
import type { TcpOutboundConnection } from "../src/protocol/types.js";
import { OutboundRuntimeAdapter } from "../src/reload/adapters/outboundRuntimeAdapter.js";
import type { ReloadOperationContext } from "../src/reload/contract.js";
import {
  createRoutingGenerationPair,
  RoutingGenerationRuntime
} from "../src/router/generation.js";
import { runtimeConfig } from "./fixtures/runtime-reload.js";

void test("transactional reload accepts direct, block, and tcpRelay candidates", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["outbound"],
      outbounds: lowRiskOutbounds()
    }));
    const snapshot = engine.getOutboundRuntimeSnapshot();
    assert.equal(snapshot.activeGenerationSequence, 1);
    assert.deepEqual(
      snapshot.generations[0]?.entries.map((entry) => entry.type).sort(),
      ["block", "direct", "tcpRelay"]
    );
    assert.deepEqual(
      engine.getLastRuntimeReloadOutcome()?.changedComponents,
      ["outbound"]
    );
  } finally {
    await engine.stop();
  }
});

void test("outbound, router, and policy publish in one transaction", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["outbound", "router", "policy"],
      outbounds: lowRiskOutbounds(),
      defaultOutbound: "automatic",
      policies: [{
        tag: "automatic",
        type: "loadBalance",
        outbounds: ["direct", "relay"],
        strategy: "roundRobin",
        unhealthyAfterFailures: 3,
        recoverAfterMs: 30_000
      }]
    }));
    assert.equal(engine.getOutboundRuntimeSnapshot().activeGenerationSequence, 1);
    assert.equal(engine.getActiveRouterGeneration().sequence, 1);
    assert.equal(engine.getActivePolicyGeneration().sequence, 1);
    assert.deepEqual(
      engine.getLastRuntimeReloadOutcome()?.changedComponents,
      ["router", "policy", "outbound"]
    );
  } finally {
    await engine.stop();
  }
});

for (const candidate of unsupportedOutbounds()) {
  void test(`transactional reload rejects ${candidate.label}`, async () => {
    const engine = new Engine(runtimeConfig());
    await engine.start();
    try {
      await assert.rejects(
        engine.reloadConfig(runtimeConfig({
          mode: "transactional-experimental",
          enabledComponents: ["outbound"],
          outbounds: [
            { type: "direct", tag: "direct" },
            { type: "block", tag: "block" },
            candidate.config
          ]
        })),
        /rejects unsupported type/u
      );
      assert.equal(engine.getOutboundRuntimeSnapshot().activeGenerationSequence, 0);
    } finally {
      await engine.stop();
    }
  });
}

void test("invalid policy reference leaves the outbound generation unchanged", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    const parsed = runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["policy", "outbound"],
      outbounds: lowRiskOutbounds()
    });
    const invalid: SepigsConfig = {
      ...parsed,
      route: {
        ...parsed.route,
        policies: [{
          tag: "invalid",
          type: "failover",
          outbounds: ["missing"],
          strategy: "roundRobin",
          unhealthyAfterFailures: 1,
          recoverAfterMs: 1_000
        }]
      }
    };
    await assert.rejects(engine.reloadConfig(invalid), /unavailable outbound/u);
    assert.equal(engine.getOutboundRuntimeSnapshot().activeGenerationSequence, 0);
    assert.equal(engine.getActivePolicyGeneration().sequence, 0);
  } finally {
    await engine.stop();
  }
});

void test("old outbound references drain while new lookups use the candidate", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    const oldReference = engine.acquireOutboundRuntimeRef("direct");
    assert.ok(oldReference);
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["outbound"],
      outbounds: lowRiskOutbounds()
    }));
    const active = engine.getOutboundRuntimeSnapshot().activeGenerationId;
    const newReference = engine.acquireOutboundRuntimeRef("direct");
    assert.ok(newReference);
    assert.notEqual(oldReference.generationId, active);
    assert.equal(newReference.generationId, active);
    assert.equal(engine.getOutboundRuntimeSnapshot().drainingGenerations, 1);
    await engine.releaseOutboundRuntimeRef(oldReference);
    assert.equal(engine.getOutboundRuntimeSnapshot().drainingGenerations, 0);
    await engine.releaseOutboundRuntimeRef(newReference);
    assert.equal(
      engine.getOutboundRuntimeSnapshot().generations[0]?.referenceCount,
      0
    );
  } finally {
    await engine.stop();
  }
});

void test("adapter reports active removed references and rollback restores old generation", async () => {
  const initial = runtimeConfig();
  const oldObjects = outboundObjects(initial.outbounds);
  const registry = new OutboundRuntimeRegistry(
    outboundGeneration("outbound-0", initial, "active"),
    oldObjects
  );
  const reference = registry.acquireOutboundRef("block");
  assert.ok(reference);
  const routing = new RoutingGenerationRuntime(createRoutingGenerationPair({
    idPrefix: "routing-0",
    sequence: 0,
    route: initial.route,
    outboundTags: new Set(initial.outbounds.map((outbound) => outbound.tag))
  }));
  const adapter = new OutboundRuntimeAdapter({
    outboundRuntimeRegistry: () => registry,
    currentOutboundConfigs: () => initial.outbounds,
    currentOutboundHealthSnapshot: () => [],
    createRuntimeOutbound: (config) => new TestOutbound(config.tag, config.type),
    routingRuntime: () => routing
  }, []);
  const candidate = runtimeConfig({
    outbounds: [{ type: "direct", tag: "direct", connectTimeoutMs: 1_500 }]
  });
  const prepared = await adapter.prepare(candidate, context());
  assert.ok(prepared.value.validationWarnings.some(
    (warning) => warning.code === "removed-active-connection-reference"
  ));
  await adapter.healthCheck(prepared);
  await adapter.commit(prepared);
  assert.notEqual(registry.getActiveGeneration().id, "outbound-0");
  await adapter.rollback(prepared);
  assert.equal(registry.getActiveGeneration().id, "outbound-0");
  await adapter.cleanup(prepared);
  await registry.releaseOutboundRef(reference);
  assert.equal(registry.snapshot().generations[0]?.referenceCount, 0);
  await registry.stopAll();
});

void test("legacy outbound reload does not produce a transactional outcome", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.start();
  try {
    await engine.reloadConfig(runtimeConfig({ outbounds: lowRiskOutbounds() }));
    assert.equal(engine.getLastRuntimeReloadOutcome(), undefined);
    assert.equal(engine.getOutboundRuntimeSnapshot().activeGenerationSequence, 0);
  } finally {
    await engine.stop();
  }
});

class TestOutbound implements Outbound {
  public constructor(
    public readonly tag: string,
    public readonly type: OutboundConfig["type"]
  ) {}

  public connect(): Promise<TcpOutboundConnection> {
    return Promise.reject(new Error("test outbound does not open sockets"));
  }

  public async stop(): Promise<void> {
    await Promise.resolve();
  }
}

const lowRiskOutbounds = (): readonly OutboundConfig[] => [
  { type: "direct", tag: "direct", connectTimeoutMs: 1_500 },
  { type: "block", tag: "block", reason: "M11 test block" },
  {
    type: "tcpRelay",
    tag: "relay",
    targetHost: "127.0.0.1",
    targetPort: 9,
    connectTimeoutMs: 100
  }
];

function unsupportedOutbounds(): readonly {
  readonly label: string;
  readonly config: OutboundConfig;
}[] {
  return [
    {
      label: "Shadowsocks",
      config: {
        type: "shadowsocks",
        tag: "shadowsocks",
        serverHost: "127.0.0.1",
        serverPort: 8388,
        method: "aes-128-gcm",
        password: "test-only-password"
      }
    },
    {
      label: "Trojan",
      config: {
        type: "trojan",
        tag: "trojan",
        serverHost: "127.0.0.1",
        serverPort: 443,
        password: "test-only-password",
        tls: { enabled: true, rejectUnauthorized: true }
      }
    },
    {
      label: "experimental WireGuard",
      config: {
        type: "wireguard",
        tag: "wireguard",
        privateKey: "test-only-private-key",
        address: ["10.0.0.2/32"],
        peer: {
          publicKey: "test-only-public-key",
          endpointHost: "127.0.0.1",
          endpointPort: 51820,
          allowedIps: ["0.0.0.0/0"]
        }
      }
    }
  ];
}

const outboundGeneration = (
  id: string,
  config: SepigsConfig,
  state: "active" | "candidate"
): OutboundGeneration => new OutboundGeneration({
  id,
  outbounds: config.outbounds,
  defaultOutbound: config.route.defaultOutbound,
  policies: config.route.policies,
  state
});

const outboundObjects = (
  configs: readonly OutboundConfig[]
): ReadonlyMap<string, Outbound> => new Map(
  configs.map((config) => [
    config.tag,
    new TestOutbound(config.tag, config.type)
  ])
);

const context = (): ReloadOperationContext => ({
  transactionId: "outbound-runtime-test",
  oldGenerationId: "old",
  candidateGenerationId: "candidate",
  deadline: Date.now() + 2_000,
  signal: new AbortController().signal
});
