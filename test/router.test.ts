import assert from "node:assert/strict";
import test from "node:test";
import { Router } from "../src/router/router.js";
import type { ProxyRequest } from "../src/protocol/types.js";
import { makeDestination } from "../src/utils/net.js";

const request = (host: string, port: number): ProxyRequest => ({
  id: "test",
  inboundTag: "test-in",
  protocol: "http",
  network: "tcp",
  destination: makeDestination(host, port),
  startedAt: Date.now()
});

void test("Router matches domain exact, suffix, CIDR, port, and default", () => {
  const router = new Router({
    defaultOutbound: "direct",
    ruleSetFiles: [],
    policies: [],
    rules: [
      { tag: "exact", outboundTag: "relay", domain: ["example.com"] },
      { tag: "suffix", outboundTag: "block", domainSuffix: ["blocked.test"] },
      { tag: "cidr", outboundTag: "lan", ipCidr: ["10.0.0.0/8"] },
      { tag: "port", outboundTag: "web", port: [8080] }
    ]
  });

  assert.deepEqual(router.match(request("example.com", 443)), {
    outboundTag: "relay",
    ruleTag: "exact",
    matched: true
  });
  assert.equal(router.match(request("api.blocked.test", 443)).outboundTag, "block");
  assert.equal(router.match(request("10.2.3.4", 22)).outboundTag, "lan");
  assert.equal(router.match(request("198.51.100.1", 8080)).outboundTag, "web");
  assert.deepEqual(router.match(request("198.51.100.1", 443)), {
    outboundTag: "direct",
    matched: false
  });
});
