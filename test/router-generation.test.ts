import assert from "node:assert/strict";
import test from "node:test";
import type { ProxyRequest } from "../src/protocol/types.js";
import {
  RoutingGenerationRuntime,
  createRoutingGenerationPair
} from "../src/router/generation.js";
import { RouterGeneration } from "../src/router/routerGeneration.js";
import { makeDestination } from "../src/utils/net.js";

const outbounds = new Set(["direct", "block"]);

void test("router generation metadata and rules are immutable", () => {
  const generation = new RouterGeneration({
    id: "router-1",
    sequence: 1,
    config: routeConfig("direct", [{ outboundTag: "block", domainSuffix: ["blocked.test"] }]),
    allowedTargets: outbounds,
    createdAt: 10
  });
  assert.equal(Object.isFrozen(generation), true);
  assert.equal(Object.isFrozen(generation.rules), true);
  assert.equal(Object.isFrozen(generation.rules[0]), true);
  assert.equal(generation.routeCachePolicy, "none");
  assert.equal(generation.createdAt, 10);
});

void test("routing runtime atomically switches the active router generation", () => {
  const runtime = new RoutingGenerationRuntime(pair("old", 0, "direct"));
  const candidate = new RouterGeneration({
    id: "candidate-router",
    sequence: 1,
    config: routeConfig("block"),
    allowedTargets: outbounds
  });
  runtime.begin("tx", ["router"]);
  runtime.stageRouter("tx", candidate);
  runtime.commit("tx", "router");
  assert.equal(runtime.active().router.id, "candidate-router");
  assert.equal(runtime.active().router.match(request("example.test", 443)).outboundTag, "block");
});

void test("routing rollback keeps or restores the old router generation", () => {
  const old = pair("old", 0, "direct");
  const runtime = new RoutingGenerationRuntime(old);
  const candidate = new RouterGeneration({
    id: "candidate-router",
    sequence: 1,
    config: routeConfig("block"),
    allowedTargets: outbounds
  });
  runtime.begin("tx", ["router"]);
  runtime.stageRouter("tx", candidate);
  runtime.commit("tx", "router");
  runtime.rollback("tx");
  assert.equal(runtime.active().router, old.router);
});

void test("old router generation and existing decision stay readable after switch", () => {
  const old = pair("old", 0, "direct");
  const runtime = new RoutingGenerationRuntime(old);
  const handle = runtime.acquire();
  const decision = handle.generation.router.match(request("example.test", 443));
  const candidate = new RouterGeneration({
    id: "candidate-router",
    sequence: 1,
    config: routeConfig("block"),
    allowedTargets: outbounds
  });
  runtime.begin("tx", ["router"]);
  runtime.stageRouter("tx", candidate);
  runtime.commit("tx", "router");

  assert.equal(handle.generation.router.match(request("example.test", 443)).outboundTag, "direct");
  assert.deepEqual(decision, { outboundTag: "direct", matched: false });
  assert.equal(runtime.active().router.match(request("example.test", 443)).outboundTag, "block");
  assert.equal(runtime.isDrainingRouter(old.router.id), true);
  handle.release();
  assert.equal(runtime.isDrainingRouter(old.router.id), false);
});

void test("invalid router targets are rejected before publication", () => {
  assert.throws(() => new RouterGeneration({
    id: "invalid",
    sequence: 1,
    config: routeConfig("missing"),
    allowedTargets: outbounds
  }), /default outbound "missing" is unavailable/u);
});

void test("router generation rejects a rule that references a missing target", () => {
  assert.throws(() => new RouterGeneration({
    id: "invalid-rule",
    sequence: 1,
    config: routeConfig("direct", [{
      outboundTag: "missing",
      domainSuffix: ["invalid.test"]
    }]),
    allowedTargets: outbounds
  }), /rule\[0\] references unavailable target "missing"/u);
});

const pair = (
  id: string,
  sequence: number,
  defaultOutbound: string
) => createRoutingGenerationPair({
  idPrefix: id,
  sequence,
  route: routeConfig(defaultOutbound),
  outboundTags: outbounds
});

const routeConfig = (
  defaultOutbound: string,
  rules: readonly { readonly outboundTag: string; readonly domainSuffix?: readonly string[] }[] = []
) => ({
  defaultOutbound,
  rules,
  ruleSetFiles: [],
  policies: []
});

const request = (host: string, port: number): ProxyRequest => ({
  id: "router-generation-test",
  inboundTag: "test",
  protocol: "http",
  network: "tcp",
  destination: makeDestination(host, port),
  startedAt: Date.now()
});
