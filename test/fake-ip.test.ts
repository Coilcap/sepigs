import assert from "node:assert/strict";
import test from "node:test";
import { FakeIpService } from "../src/dns/fakeIp.js";

void test("fake-ip service provides stable bidirectional LRU mappings", () => {
  const service = new FakeIpService({ enabled: true, range: "198.18.0.0/24", size: 2, ttlSeconds: 60 });
  const first = service.assign("Example.COM");
  assert.equal(service.assign("example.com"), first);
  assert.equal(service.reverse(first), "example.com");
  assert.match(first, /^198\.18\.0\./u);
  service.assign("two.test"); service.assign("three.test");
  assert.notEqual(service.reverse(first), "example.com");
});
