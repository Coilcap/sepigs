import assert from "node:assert/strict";
import dgram from "node:dgram";
import test from "node:test";
import { SystemDnsResolver } from "../src/dns/resolver.js";
import { Logger } from "../src/logger/logger.js";

void test("SystemDnsResolver resolves through UDP DNS server and caches the result", async () => {
  const server = await startDnsServer("203.0.113.7");
  const resolver = new SystemDnsResolver(
    {
      strategy: "prefer-ipv4",
      cacheTtlMs: 60_000,
      hosts: {},
      udpServers: [{ tag: "local", address: "127.0.0.1", port: server.port, timeoutMs: 500 }],
      rules: [{ domainSuffix: ["example.test"], serverTag: "local" }],
      fallbackHosts: {},
      fakeIp: { enabled: false, cidr: "198.18.0.0/15" },
    doh: { enabled: false, endpoints: [], timeoutMs: 1_000 }
    },
    new Logger("silent")
  );

  try {
    assert.equal(await resolver.resolve("www.example.test"), "203.0.113.7");
    assert.equal(await resolver.resolve("www.example.test"), "203.0.113.7");
    assert.equal(server.queries(), 1);
  } finally {
    await server.close();
  }
});

void test("SystemDnsResolver uses fallbackHosts after DNS failure", async () => {
  const resolver = new SystemDnsResolver(
    {
      strategy: "prefer-ipv4",
      cacheTtlMs: 60_000,
      hosts: {},
      udpServers: [{ tag: "missing", address: "127.0.0.1", port: 9, timeoutMs: 20 }],
      rules: [],
      fallbackHosts: { "fallback.test": "192.0.2.9" },
      fakeIp: { enabled: false, cidr: "198.18.0.0/15" },
    doh: { enabled: false, endpoints: [], timeoutMs: 1_000 }
    },
    new Logger("silent")
  );

  assert.equal(await resolver.resolve("fallback.test"), "192.0.2.9");
});

const startDnsServer = async (address: string): Promise<{ readonly port: number; queries(): number; close(): Promise<void> }> => {
  const server = dgram.createSocket("udp4");
  let queryCount = 0;
  server.on("message", (message, rinfo) => {
    queryCount += 1;
    const response = buildDnsResponse(message, address);
    server.send(response, rinfo.port, rinfo.address);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", () => {
      resolve();
    });
    server.bind(0, "127.0.0.1");
  });
  const bound = server.address();
  return {
    port: bound.port,
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
  const octets = address.split(".").map((part) => Number(part));
  return Buffer.concat([
    header,
    query.subarray(12, questionEnd),
    Buffer.from([0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x3c, 0x00, 0x04, ...octets])
  ]);
};
