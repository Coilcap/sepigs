import assert from "node:assert/strict";
import test from "node:test";
import { SystemDnsResolver } from "../src/dns/resolver.js";
import { Logger } from "../src/logger/logger.js";

void test("fake-IP disabled leaves ordinary DNS/static-host resolution unchanged", async () => { const resolver = new SystemDnsResolver({ strategy: "system", cacheTtlMs: 60_000, hosts: { "plain.test": "192.0.2.8" }, udpServers: [], rules: [], fallbackHosts: {}, fakeIp: { enabled: false, range: "198.18.0.0/15" }, doh: { enabled: false, endpoints: [], timeoutMs: 100 } }, new Logger("silent")); assert.equal(await resolver.resolveForClient("plain.test"), "192.0.2.8"); assert.equal(await resolver.resolve("plain.test"), "192.0.2.8"); assert.equal(resolver.reverseFakeIp("198.18.0.1"), undefined); });
