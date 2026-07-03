import assert from "node:assert/strict";
import dgram from "node:dgram";
import test from "node:test";
import type { SepigsConfig } from "../src/config/types.js";
import { Engine } from "../src/core/engine.js";
import { SystemDnsResolver } from "../src/dns/resolver.js";
import { Logger } from "../src/logger/logger.js";
import { DnsRuntimeAdapter } from "../src/reload/adapters/dnsRuntimeAdapter.js";
import type { ReloadOperationContext } from "../src/reload/contract.js";
import { waitFor } from "./helpers.js";
import { runtimeConfig } from "./fixtures/runtime-reload.js";

void test("transactional DNS reload publishes a new generation", async () => {
  const engine = new Engine(runtimeConfig());
  const before = engine.getActiveDnsGeneration();
  await engine.reloadConfig(runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["dns"],
    dns: { hosts: { "candidate.test": "192.0.2.20" } }
  }));
  assert.equal(engine.getActiveDnsGeneration().sequence, before.sequence + 1);
  assert.equal(await engine.resolveDns("candidate.test"), "192.0.2.20");
  assert.deepEqual(engine.getLastRuntimeReloadOutcome()?.changedComponents, ["dns"]);
});

void test("invalid UDP upstream rolls back DNS generation", async () => {
  const engine = new Engine(runtimeConfig());
  const before = engine.getActiveDnsGeneration();
  const valid = runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["dns"],
    dns: {
      udpServers: [{
        tag: "invalid",
        address: "127.0.0.1",
        port: 53,
        timeoutMs: 100
      }]
    }
  });
  const invalidServer = valid.dns.udpServers[0];
  assert.ok(invalidServer);
  const invalid: SepigsConfig = {
    ...valid,
    dns: {
      ...valid.dns,
      udpServers: [{
        ...invalidServer,
        address: "bad upstream"
      }]
    }
  };
  await assert.rejects(
    engine.reloadConfig(invalid),
    /has invalid address/u
  );
  assert.deepEqual(engine.getActiveDnsGeneration(), before);
});

void test("invalid DoH config rolls back DNS generation", async () => {
  const engine = new Engine(runtimeConfig());
  const before = engine.getActiveDnsGeneration();
  const candidate = runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["dns"],
    dns: {
      doh: {
        enabled: true,
        endpoints: ["not-a-url"],
        timeoutMs: 100
      }
    }
  });
  await assert.rejects(engine.reloadConfig(candidate), /invalid DoH endpoint URL/u);
  assert.deepEqual(engine.getActiveDnsGeneration(), before);
});

void test("loopback IPv6 plaintext DoH passes structural validation", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.reloadConfig(runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["dns"],
    dns: {
      doh: {
        enabled: true,
        endpoints: ["http://[::1]:8053/dns-query"],
        timeoutMs: 100
      }
    }
  }));
  assert.equal(engine.getActiveDnsGeneration().sequence, 1);
});

void test("fake-IP change is rejected before DNS publication", async () => {
  const engine = new Engine(runtimeConfig());
  const before = engine.getActiveDnsGeneration();
  const candidate = runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["dns"],
    dns: {
      fakeIp: { enabled: true }
    }
  });
  await assert.rejects(
    engine.reloadConfig(candidate),
    /unsupported high-risk fake-IP configuration change/u
  );
  assert.deepEqual(engine.getActiveDnsGeneration(), before);
});

void test("compatible DNS reload carries positive cache", async () => {
  const engine = new Engine(runtimeConfig());
  assert.ok((await engine.resolveDns("localhost")).length > 0);
  assert.equal(engine.getActiveDnsGeneration().cacheEntries, 1);
  await engine.reloadConfig(runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["dns"],
    dns: { cacheTtlMs: 30_000 }
  }));
  assert.equal(engine.getActiveDnsGeneration().cacheEntries, 1);
});

void test("upstream change clears positive DNS cache", async () => {
  const engine = new Engine(runtimeConfig());
  assert.ok((await engine.resolveDns("localhost")).length > 0);
  await engine.reloadConfig(runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["dns"],
    dns: {
      udpServers: [{
        tag: "changed",
        address: "127.0.0.1",
        port: 9,
        timeoutMs: 20
      }]
    }
  }));
  assert.equal(engine.getActiveDnsGeneration().cacheEntries, 0);
});

void test("old in-flight DNS query completes in old generation while new query uses candidate", async () => {
  const oldServer = await startDnsServer("192.0.2.10", 80);
  const newServer = await startDnsServer("192.0.2.20", 0);
  const engine = new Engine(runtimeConfig({
    dns: { udpServers: [dnsServerConfig("old", oldServer.port)] }
  }));
  try {
    const oldQuery = engine.resolveDns("switch.test");
    await waitFor(() => oldServer.queries() === 1);
    await engine.reloadConfig(runtimeConfig({
      mode: "transactional-experimental",
      enabledComponents: ["dns"],
      dns: { udpServers: [dnsServerConfig("new", newServer.port)] }
    }));
    const newQuery = engine.resolveDns("switch.test");
    assert.equal(await newQuery, "192.0.2.20");
    assert.equal(await oldQuery, "192.0.2.10");
    await waitFor(() => engine.getActiveDnsGeneration().drainingGenerations === 0);
    assert.equal(oldServer.queries(), 1);
    assert.equal(newServer.queries(), 1);
  } finally {
    await engine.stop();
    await oldServer.close();
    await newServer.close();
  }
});

void test("adapter rollback after switch restores old DNS cache and generation", async () => {
  const initial = runtimeConfig();
  const resolver = new SystemDnsResolver(initial.dns, new Logger("silent"));
  const store = resolver.generationStore();
  const old = store.active();
  old.setPositive({
    host: "rollback.test",
    address: "192.0.2.50",
    expiresAt: Date.now() + 60_000,
    touchedAt: Date.now(),
    source: "system",
    sensitive: false,
    synthetic: false
  });
  const adapter = new DnsRuntimeAdapter({
    dnsGenerationStore: () => store,
    dnsFailureCountersSnapshot: () => ({ queries: 0, failures: 0 })
  });
  const prepared = await adapter.prepare(runtimeConfig({
    mode: "transactional-experimental",
    enabledComponents: ["dns"],
    dns: { cacheTtlMs: 30_000 }
  }), context());
  await adapter.healthCheck(prepared);
  await adapter.commit(prepared);
  assert.notEqual(store.active(), old);
  await adapter.rollback(prepared);
  assert.equal(store.active(), old);
  assert.equal(old.cache.get("rollback.test")?.address, "192.0.2.50");
  await adapter.cleanup(prepared);
});

void test("legacy DNS reload keeps the legacy path", async () => {
  const engine = new Engine(runtimeConfig());
  await engine.reloadConfig(runtimeConfig({
    dns: { hosts: { "legacy-dns.test": "192.0.2.60" } }
  }));
  assert.equal(await engine.resolveDns("legacy-dns.test"), "192.0.2.60");
  assert.equal(engine.getLastRuntimeReloadOutcome(), undefined);
});

const context = (): ReloadOperationContext => ({
  transactionId: "dns-runtime-test",
  oldGenerationId: "old",
  candidateGenerationId: "candidate",
  deadline: Date.now() + 2_000,
  signal: new AbortController().signal
});

const dnsServerConfig = (tag: string, port: number) => ({
  tag,
  address: "127.0.0.1",
  port,
  timeoutMs: 500
});

const startDnsServer = async (
  address: string,
  delayMs: number
): Promise<{
  readonly port: number;
  queries(): number;
  close(): Promise<void>;
}> => {
  const server = dgram.createSocket("udp4");
  let queryCount = 0;
  server.on("message", (message, rinfo) => {
    queryCount += 1;
    setTimeout(() => {
      server.send(buildDnsResponse(message, address), rinfo.port, rinfo.address);
    }, delayMs);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.bind(0, "127.0.0.1", () => {
      resolve();
    });
  });
  return {
    port: server.address().port,
    queries: () => queryCount,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  };
};

const buildDnsResponse = (query: Buffer, address: string): Buffer => {
  let questionEnd = 12;
  while (questionEnd < query.length && query[questionEnd] !== 0) {
    questionEnd += (query[questionEnd] ?? 0) + 1;
  }
  questionEnd += 5;
  const header = Buffer.from(query.subarray(0, 12));
  header[2] = 0x81;
  header[3] = 0x80;
  header[6] = 0x00;
  header[7] = 0x01;
  const octets = address.split(".").map(Number);
  return Buffer.concat([
    header,
    query.subarray(12, questionEnd),
    Buffer.from([
      0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x3c, 0x00, 0x04,
      ...octets
    ])
  ]);
};
