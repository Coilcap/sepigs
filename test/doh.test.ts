import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { SystemDnsResolver } from "../src/dns/resolver.js";
import { Logger } from "../src/logger/logger.js";
import { getPort } from "./helpers.js";

void test("SystemDnsResolver resolves through DoH POST and caches by TTL", async () => {
  const doh = await startDohServer("198.51.100.42");
  const resolver = new SystemDnsResolver(
    {
      strategy: "prefer-ipv4",
      cacheTtlMs: 60_000,
      hosts: {},
      udpServers: [],
      rules: [],
      fallbackHosts: {},
      fakeIp: { enabled: false, cidr: "198.18.0.0/15" },
      doh: { enabled: true, endpoints: [`http://127.0.0.1:${doh.port}/dns-query`], timeoutMs: 500 }
    },
    new Logger("silent")
  );

  try {
    assert.equal(await resolver.resolve("doh.example.test"), "198.51.100.42");
    assert.equal(await resolver.resolve("doh.example.test"), "198.51.100.42");
    assert.equal(doh.queries(), 1);
  } finally {
    await doh.close();
  }
});

void test("SystemDnsResolver falls back after DoH failure", async () => {
  const doh = await startBrokenDohServer();
  const resolver = new SystemDnsResolver(
    {
      strategy: "prefer-ipv4",
      cacheTtlMs: 60_000,
      hosts: {},
      udpServers: [],
      rules: [],
      fallbackHosts: { "fallback.doh.test": "203.0.113.12" },
      fakeIp: { enabled: false, cidr: "198.18.0.0/15" },
      doh: { enabled: true, endpoints: [`http://127.0.0.1:${doh.port}/dns-query`], timeoutMs: 500 }
    },
    new Logger("silent")
  );

  try {
    assert.equal(await resolver.resolve("fallback.doh.test"), "203.0.113.12");
  } finally {
    await doh.close();
  }
});

const startDohServer = async (address: string): Promise<{ readonly port: number; queries(): number; close(): Promise<void> }> => {
  let queryCount = 0;
  const server = http.createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    request.once("end", () => {
      queryCount += 1;
      const query = Buffer.concat(chunks);
      response.writeHead(200, { "content-type": "application/dns-message" });
      response.end(buildDnsResponse(query, address));
    });
  });
  await listen(server);
  return {
    port: getPort(server.address()),
    queries: () => queryCount,
    close: async () => {
      await closeServer(server);
    }
  };
};

const startBrokenDohServer = async (): Promise<{ readonly port: number; close(): Promise<void> }> => {
  const server = http.createServer((_request, response) => {
    response.writeHead(500);
    response.end("broken");
  });
  await listen(server);
  return {
    port: getPort(server.address()),
    close: async () => {
      await closeServer(server);
    }
  };
};

const listen = async (server: http.Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
    server.listen(0, "127.0.0.1");
  });
};

const closeServer = async (server: http.Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
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
