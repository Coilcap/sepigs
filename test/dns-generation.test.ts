import assert from "node:assert/strict";
import test from "node:test";
import type { DnsConfig } from "../src/config/types.js";
import { DNSGeneration } from "../src/dns/generation.js";
import { DNSGenerationStore } from "../src/dns/generationStore.js";

void test("DNS generation exposes immutable metadata and isolated runtime state", () => {
  const generation = createGeneration("dns-0", 0);
  assert.equal(Object.isFrozen(generation), true);
  assert.equal(Object.isFrozen(generation.config), true);
  assert.equal(generation.mode, "system");
  assert.equal(generation.cache.size, 0);
  assert.equal(generation.negativeCache.size, 0);
  assert.equal(generation.inFlight, 0);
  assert.equal(generation.draining, false);
});

void test("DNS generation store atomically switches and marks old generation draining", () => {
  const old = createGeneration("dns-old", 0);
  const candidate = createGeneration("dns-candidate", 1);
  const store = new DNSGenerationStore(old);
  assert.equal(store.switchTo(candidate), old);
  assert.equal(store.active(), candidate);
  assert.equal(old.draining, true);
  assert.equal(candidate.draining, false);
});

void test("in-flight query reference prevents old generation release", () => {
  const old = createGeneration("dns-old", 0);
  const candidate = createGeneration("dns-candidate", 1);
  const store = new DNSGenerationStore(old);
  const handle = store.acquire();
  store.switchTo(candidate);
  assert.deepEqual(store.releaseDrained(), []);
  assert.equal(store.has(old.id), true);
  handle.release();
  assert.equal(store.has(old.id), false);
});

void test("old generation releases after its single-flight work completes", async () => {
  const old = createGeneration("dns-old", 0);
  const candidate = createGeneration("dns-candidate", 1);
  const store = new DNSGenerationStore(old);
  const handle = store.acquire();
  let finish: (() => void) | undefined;
  const pending = old.runSingleFlight("A:delayed.test", async () =>
    await new Promise<string>((resolve) => {
      finish = () => {
        resolve("192.0.2.1");
      };
    })
  );
  store.switchTo(candidate);
  handle.release();
  assert.equal(store.has(old.id), true);
  finish?.();
  assert.equal(await pending, "192.0.2.1");
  store.releaseDrained();
  assert.equal(store.has(old.id), false);
});

void test("DNS generation rollback restores the old active generation", () => {
  const old = createGeneration("dns-old", 0);
  const candidate = createGeneration("dns-candidate", 1);
  const store = new DNSGenerationStore(old);
  store.switchTo(candidate);
  store.restore(old, candidate);
  assert.equal(store.active(), old);
  assert.equal(old.draining, false);
});

void test("DNS generation caches are not shared implicitly", () => {
  const old = createGeneration("dns-old", 0);
  const candidate = createGeneration("dns-candidate", 1);
  old.setPositive(positive("cached.test", "192.0.2.10"));
  assert.equal(old.cache.size, 1);
  assert.equal(candidate.cache.size, 0);
  assert.notEqual(old.cache, candidate.cache);
});

const createGeneration = (
  id: string,
  sequence: number,
  config: DnsConfig = dnsConfig()
): DNSGeneration => new DNSGeneration({ id, sequence, config });

const positive = (host: string, address: string) => ({
  host,
  address,
  expiresAt: Date.now() + 60_000,
  touchedAt: Date.now(),
  source: "system" as const,
  sensitive: false,
  synthetic: false
});

const dnsConfig = (): DnsConfig => ({
  strategy: "system",
  cacheTtlMs: 60_000,
  cacheMaxEntries: 32,
  negativeTtlMs: 5_000,
  hosts: {},
  udpServers: [],
  rules: [],
  fallbackHosts: {},
  fakeIp: {
    enabled: false,
    range: "198.18.0.0/15",
    size: 32,
    ttlSeconds: 60
  },
  doh: {
    enabled: false,
    endpoints: [],
    timeoutMs: 1_000
  }
});
