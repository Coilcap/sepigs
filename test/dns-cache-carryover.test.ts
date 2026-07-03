import assert from "node:assert/strict";
import test from "node:test";
import type { DnsConfig } from "../src/config/types.js";
import {
  applyDnsCacheCarryover,
  planDnsCacheCarryover
} from "../src/dns/cacheCarryover.js";
import { DNSGeneration } from "../src/dns/generation.js";

const NOW = 10_000;

void test("compatible DNS config copies positive cache by value", () => {
  const old = generation(config());
  old.setPositive(positive("cached.test", NOW + 20_000));
  const candidate = generation(config(), "candidate", 1);
  const plan = planDnsCacheCarryover(old, candidate.config, { now: NOW });
  applyDnsCacheCarryover(candidate, plan);
  assert.equal(plan.carried, 1);
  assert.equal(candidate.cache.get("cached.test")?.address, "192.0.2.10");
  assert.notEqual(candidate.cache.get("cached.test"), old.cache.get("cached.test"));
});

void test("expired DNS cache entry is dropped", () => {
  const old = generation(config());
  old.setPositive(positive("expired.test", NOW - 1));
  const plan = planDnsCacheCarryover(old, config(), { now: NOW });
  assert.equal(plan.carried, 0);
  assert.equal(plan.dropped, 1);
});

void test("carry-over preserves or shortens TTL but never extends it", () => {
  const old = generation(config());
  old.setPositive(positive("ttl.test", NOW + 60_000));
  const candidateConfig = { ...config(), cacheTtlMs: 5_000 };
  const plan = planDnsCacheCarryover(old, candidateConfig, { now: NOW });
  assert.equal(plan.positiveEntries[0]?.expiresAt, NOW + 5_000);
});

void test("upstream change clears DNS cache carry-over", () => {
  const old = generation(config());
  old.setPositive(positive("upstream.test", NOW + 20_000));
  const changed: DnsConfig = {
    ...config(),
    udpServers: [{
      tag: "local",
      address: "127.0.0.1",
      port: 5353,
      timeoutMs: 100
    }]
  };
  const plan = planDnsCacheCarryover(old, changed, { now: NOW });
  assert.equal(plan.allowed, false);
  assert.equal(plan.reason, "resolver-identity-changed");
  assert.equal(plan.carried, 0);
});

void test("UDP to DoH mode change clears DNS cache carry-over", () => {
  const udp = config({
    udpServers: [{
      tag: "local",
      address: "127.0.0.1",
      port: 5353,
      timeoutMs: 100
    }]
  });
  const old = generation(udp);
  old.setPositive(positive("mode.test", NOW + 20_000));
  const doh = config({
    doh: {
      enabled: true,
      endpoints: ["https://dns.example/dns-query"],
      timeoutMs: 100
    }
  });
  assert.equal(planDnsCacheCarryover(old, doh, { now: NOW }).carried, 0);
});

void test("fake-IP change rejects DNS-only carry-over", () => {
  const old = generation(config());
  const changed = config({
    fakeIp: {
      enabled: true,
      range: "198.18.0.0/15",
      size: 32,
      ttlSeconds: 60
    }
  });
  assert.throws(
    () => planDnsCacheCarryover(old, changed, { now: NOW }),
    /rejected high-risk fake-IP configuration change/u
  );
});

void test("negative cache is not copied by default", () => {
  const old = generation(config());
  old.setNegative({
    host: "negative.test",
    message: "not found",
    expiresAt: NOW + 2_000,
    touchedAt: NOW,
    source: "system",
    sensitive: false,
    synthetic: false
  });
  const plan = planDnsCacheCarryover(old, config(), { now: NOW });
  assert.equal(plan.negativeEntries.length, 0);
  assert.equal(plan.dropped, 1);
});

void test("sensitive and synthetic entries are not copied", () => {
  const old = generation(config());
  old.setPositive({ ...positive("sensitive.test", NOW + 20_000), sensitive: true });
  old.setPositive({ ...positive("synthetic.test", NOW + 20_000), synthetic: true });
  const plan = planDnsCacheCarryover(old, config(), { now: NOW });
  assert.equal(plan.carried, 0);
  assert.equal(plan.dropped, 2);
});

const generation = (
  dns: DnsConfig,
  id = "old",
  sequence = 0
): DNSGeneration => new DNSGeneration({ id, sequence, config: dns });

const positive = (host: string, expiresAt: number) => ({
  host,
  address: "192.0.2.10",
  expiresAt,
  touchedAt: NOW,
  source: "system" as const,
  sensitive: false,
  synthetic: false
});

const config = (overrides: Partial<DnsConfig> = {}): DnsConfig => ({
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
  },
  ...overrides
});
