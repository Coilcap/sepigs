import assert from "node:assert/strict";
import test from "node:test";
import type { OutboundConfig } from "../src/config/types.js";
import { OutboundGeneration } from "../src/outbound/generation.js";
import type { Outbound } from "../src/outbound/outbound.js";
import { OutboundRuntimeRegistry } from "../src/outbound/runtimeRegistry.js";
import type { TcpOutboundConnection } from "../src/protocol/types.js";

void test("outbound runtime registry acquires and releases stable references", async () => {
  const outbound = new TestOutbound("direct", "direct");
  const registry = createRegistry("generation-0", [direct()], [outbound]);
  const reference = registry.acquireOutboundRef("direct");
  assert.ok(reference);
  assert.equal(reference.outbound, outbound);
  assert.equal(registry.snapshot().generations[0]?.referenceCount, 1);
  await registry.releaseOutboundRef(reference);
  assert.equal(registry.snapshot().generations[0]?.referenceCount, 0);
});

void test("switch retains referenced old generation and retires it after release", async () => {
  const retired: Outbound[] = [];
  const oldOutbound = new TestOutbound("direct", "direct");
  const registry = createRegistry(
    "generation-0",
    [direct()],
    [oldOutbound],
    (outbound) => retired.push(outbound)
  );
  const oldReference = registry.acquireOutboundRef("direct");
  assert.ok(oldReference);
  const candidate = generation("generation-1", [block()]);
  const candidateOutbound = new TestOutbound("block", "block");
  const oldId = registry.switchGeneration(
    candidate,
    new Map([["block", candidateOutbound]])
  );
  assert.equal(oldId, "generation-0");
  assert.equal(registry.getActiveGeneration(), candidate);
  assert.equal(registry.getOutbound("direct", "generation-0"), oldOutbound);
  assert.equal(await registry.retireIfUnused("generation-0"), false);
  assert.equal(registry.snapshot().drainingGenerations, 1);
  await registry.releaseOutboundRef(oldReference);
  assert.equal(registry.snapshot().drainingGenerations, 0);
  assert.equal(registry.getOutbound("direct", "generation-0"), undefined);
  assert.equal(oldOutbound.stops, 1);
  assert.deepEqual(retired, [oldOutbound]);
});

void test("missing outbound tags do not create references", () => {
  const registry = createRegistry(
    "generation-0",
    [direct()],
    [new TestOutbound("direct", "direct")]
  );
  assert.equal(registry.getOutbound("missing"), undefined);
  assert.equal(registry.acquireOutboundRef("missing"), undefined);
  assert.equal(registry.snapshot().generations[0]?.referenceCount, 0);
});

void test("acquires around an atomic switch remain bound to one generation", async () => {
  const oldOutbound = new TestOutbound("direct", "direct");
  const registry = createRegistry("generation-0", [direct()], [oldOutbound]);
  const before = registry.acquireOutboundRef("direct");
  assert.ok(before);
  const newOutbound = new TestOutbound("direct", "direct");
  registry.switchGeneration(
    generation("generation-1", [direct({ connectTimeoutMs: 5_000 })]),
    new Map([["direct", newOutbound]])
  );
  const after = registry.acquireOutboundRef("direct");
  assert.ok(after);
  assert.equal(before.generationId, "generation-0");
  assert.equal(before.outbound, oldOutbound);
  assert.equal(after.generationId, "generation-1");
  assert.equal(after.outbound, newOutbound);
  await registry.releaseOutboundRef(before);
  await registry.releaseOutboundRef(after);
});

void test("runtime registry snapshots contain no outbound secrets", () => {
  const secret = "test-only-secret-value";
  const config: OutboundConfig = {
    type: "shadowsocks",
    tag: "secret-outbound",
    serverHost: "127.0.0.1",
    serverPort: 8388,
    method: "aes-128-gcm",
    password: secret
  };
  const registry = createRegistry(
    "generation-0",
    [config],
    [new TestOutbound("secret-outbound", "shadowsocks")]
  );
  const snapshot = JSON.stringify(registry.snapshot());
  assert.doesNotMatch(snapshot, new RegExp(secret, "u"));
  assert.doesNotMatch(snapshot, /password|privateKey|token/u);
});

class TestOutbound implements Outbound {
  public stops = 0;

  public constructor(
    public readonly tag: string,
    public readonly type: OutboundConfig["type"]
  ) {}

  public connect(): Promise<TcpOutboundConnection> {
    return Promise.reject(new Error("test outbound does not open sockets"));
  }

  public async stop(): Promise<void> {
    this.stops += 1;
    await Promise.resolve();
  }
}

const direct = (
  extra: Partial<Extract<OutboundConfig, { type: "direct" }>> = {}
): OutboundConfig => ({ type: "direct", tag: "direct", ...extra });

const block = (): OutboundConfig => ({
  type: "block",
  tag: "block",
  reason: "test-only"
});

const generation = (
  id: string,
  outbounds: readonly OutboundConfig[]
): OutboundGeneration => new OutboundGeneration({
  id,
  outbounds,
  defaultOutbound: outbounds[0]?.tag ?? "missing",
  policies: [],
  state: id === "generation-0" ? "active" : "candidate"
});

const createRegistry = (
  id: string,
  configs: readonly OutboundConfig[],
  outbounds: readonly Outbound[],
  onRetire?: (outbound: Outbound) => void
): OutboundRuntimeRegistry => new OutboundRuntimeRegistry(
  generation(id, configs),
  new Map(outbounds.map((outbound) => [outbound.tag, outbound])),
  onRetire === undefined ? {} : { onRetire }
);
