import assert from "node:assert/strict";
import test from "node:test";
import { FakeIpService } from "../src/dns/fakeIp.js";

void test("fake-IP mappings expire and LRU entries are reused safely", async () => { const service = new FakeIpService({ enabled: true, range: "198.18.0.0/29", size: 2, ttlSeconds: 0.02 }); const first = service.assign("first.test"); assert.equal(service.reverse(first), "first.test"); await new Promise((resolve) => setTimeout(resolve, 30)); assert.equal(service.reverse(first), undefined); const next = service.assign("next.test"); service.assign("last.test"); const reused = service.assign("third.test"); assert.ok(next !== reused || service.reverse(reused) === "third.test"); });
