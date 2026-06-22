import assert from "node:assert/strict";
import test from "node:test";
import { Router } from "../src/router/router.js";
import { FakeIpService } from "../src/dns/fakeIp.js";

void test("fake-IP reverse mapping restores a domain for unchanged router logic", () => { const fake = new FakeIpService({ enabled: true, range: "198.18.0.0/29", size: 4, ttlSeconds: 60 }); const address = fake.assign("route.test"); const domain = fake.reverse(address); if (domain === undefined) throw new Error("fake-IP reverse mapping missing"); assert.equal(domain, "route.test"); const router = new Router({ defaultOutbound: "block", ruleSetFiles: [], policies: [], rules: [{ domain: [domain], outboundTag: "direct" }] }); assert.equal(router.match({ id: "1", inboundTag: "test", protocol: "http", network: "tcp", destination: { host: domain, port: 443, addressType: "domain" }, startedAt: Date.now() }).outboundTag, "direct"); });
