import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HotReloadManager } from "../src/config/hotReload.js";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { TcpConnectionPool } from "../src/core/connectionPool.js";
import { Logger } from "../src/logger/logger.js";
import { WasmExtensionManager } from "../src/plugin/wasm.js";
import { RoutingPolicyManager } from "../src/router/policy.js";
import { UnavailableQuicTransport } from "../src/transport/quic.js";
import { closeSocket, connectTcp, makeDestination } from "../src/utils/net.js";
import { WorkerPool } from "../src/workers/workerPool.js";
import { connectClient, getPort, readUntil, startTcpEchoServer, waitFor } from "./helpers.js";

const silentLogger = new Logger("silent");

void test("PluginManager dynamically loads a plugin outbound factory before engine start", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sepigs-plugin-"));
  const pluginPath = join(dir, "test-plugin.mjs");
  await writeFile(
    pluginPath,
    [
      "export default {",
      "  name: 'test-plugin',",
      "  setup(ctx) {",
      "    ctx.registerOutboundFactory('plugin.testDirect', (config, context) => ({",
      "      tag: config.tag,",
      "      type: config.type,",
      "      async connect(request) {",
      "        const net = await import('node:net');",
      "        const socket = net.createConnection({ host: request.destination.host, port: request.destination.port });",
      "        await new Promise((resolve, reject) => {",
      "          const timer = setTimeout(() => { socket.destroy(); reject(new Error('plugin connect timeout')); }, context.limits.connectTimeoutMs);",
      "          socket.once('connect', () => { clearTimeout(timer); socket.setNoDelay(true); resolve(); });",
      "          socket.once('error', (error) => { clearTimeout(timer); reject(error); });",
      "        });",
      "        return { socket, outboundTag: config.tag };",
      "      },",
      "      async stop() {}",
      "    }));",
      "  }",
      "};"
    ].join("\n"),
    "utf8"
  );

  const echo = await startTcpEchoServer();
  const config = parseConfig({
    log: { level: "silent" },
    plugins: { modules: [{ tag: "test-plugin", path: pluginPath }], wasm: [] },
    limits: { connectTimeoutMs: 500, handshakeTimeoutMs: 500, idleTimeoutMs: 1_000 },
    inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
    outbounds: [{ type: "plugin.testDirect", tag: "plugin-direct", options: {} }],
    route: { defaultOutbound: "plugin-direct", rules: [] }
  });
  const engine = new Engine(config);
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    await readUntil(client, (buffer) => buffer.includes("200 Connection Established"));
    client.write("plugin-ok");
    await readUntil(client, (buffer) => buffer.includes("plugin-ok"));
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
  }
});

void test("WasmExtensionManager loads a real WASM module and calls an exported function", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sepigs-wasm-"));
  const wasmPath = join(dir, "answer.wasm");
  await writeFile(
    wasmPath,
    Buffer.from([
      0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7f, 0x03,
      0x02, 0x01, 0x00, 0x07, 0x0a, 0x01, 0x06, 0x61, 0x6e, 0x73, 0x77, 0x65, 0x72, 0x00, 0x00, 0x0a,
      0x06, 0x01, 0x04, 0x00, 0x41, 0x2a, 0x0b
    ])
  );

  const manager = new WasmExtensionManager(silentLogger);
  await manager.loadAll([{ tag: "answer", path: wasmPath, enabled: true }]);

  assert.deepEqual(manager.list(), [{ tag: "answer", exports: ["answer"] }]);
  assert.equal(manager.get("answer")?.callNumber("answer"), 42);
});

void test("WorkerPool runs CPU tasks on worker threads and shuts down cleanly", async () => {
  const pool = new WorkerPool({ enabled: true, size: 2, taskTimeoutMs: 1_000 }, silentLogger);
  await pool.start();
  try {
    const result = await pool.run({ kind: "sha256", value: "sepigs" });
    assert.deepEqual(result, {
      kind: "sha256",
      value: createHash("sha256").update("sepigs").digest("hex")
    });
    assert.equal(pool.snapshot().size, 2);
  } finally {
    await pool.stop();
  }
  assert.equal(pool.snapshot().size, 0);
});

void test("TcpConnectionPool reuses idle TCP streams and releases them on closeAll", async () => {
  const echo = await startTcpEchoServer();
  const pool = new TcpConnectionPool({ enabled: true, maxIdlePerEndpoint: 1, idleTimeoutMs: 1_000 }, silentLogger);
  const endpoint = { protocol: "tcp" as const, host: "127.0.0.1", port: echo.port };
  let created = 0;

  try {
    const first = await pool.lease(endpoint, async () => {
      created += 1;
      return await connectTcp(endpoint.host, endpoint.port, 500, silentLogger);
    });
    pool.release(endpoint, first);
    const second = await pool.lease(endpoint, async () => {
      created += 1;
      return await connectTcp(endpoint.host, endpoint.port, 500, silentLogger);
    });
    assert.equal(second, first);
    assert.equal(created, 1);
    pool.release(endpoint, second);
    assert.equal(pool.snapshot().idleConnections, 1);
  } finally {
    pool.closeAll();
    await echo.close();
  }
  assert.equal(pool.snapshot().idleConnections, 0);
});

void test("QUIC transport exposes a clear capability boundary when no runtime implementation is registered", async () => {
  const quic = new UnavailableQuicTransport({ enabled: true, handshakeTimeoutMs: 500 }, silentLogger);
  await assert.rejects(
    async () => await quic.connect({ destination: makeDestination("example.com", 443), alpnProtocols: ["h3"] }),
    /QUIC transport is not available/u
  );
});

void test("RoutingPolicyManager supports round-robin, latency preference, and failover health", () => {
  const manager = new RoutingPolicyManager([
    {
      tag: "auto",
      type: "loadBalance",
      outbounds: ["a", "b"],
      strategy: "roundRobin",
      unhealthyAfterFailures: 2,
      recoverAfterMs: 10_000
    },
    {
      tag: "fast",
      type: "loadBalance",
      outbounds: ["a", "b"],
      strategy: "leastLatency",
      unhealthyAfterFailures: 2,
      recoverAfterMs: 10_000
    },
    {
      tag: "fallback",
      type: "failover",
      outbounds: ["a", "b"],
      strategy: "roundRobin",
      unhealthyAfterFailures: 1,
      recoverAfterMs: 10_000
    }
  ]);

  assert.deepEqual(manager.select("auto").candidates.slice(0, 2), ["a", "b"]);
  assert.deepEqual(manager.select("auto").candidates.slice(0, 2), ["b", "a"]);
  manager.recordSuccess("a", 50);
  manager.recordSuccess("b", 5);
  assert.equal(manager.select("fast").candidates[0], "b");
  manager.recordFailure("a");
  assert.equal(manager.select("fallback").candidates[0], "b");
});

void test("Engine failover policy retries the next outbound candidate", async () => {
  const echo = await startTcpEchoServer();
  const config = parseConfig({
    log: { level: "silent" },
    limits: { connectTimeoutMs: 120, handshakeTimeoutMs: 500, idleTimeoutMs: 1_000 },
    inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
    outbounds: [
      { type: "tcpRelay", tag: "bad", targetHost: "127.0.0.1", targetPort: 1, connectTimeoutMs: 120 },
      { type: "tcpRelay", tag: "good", targetHost: "127.0.0.1", targetPort: echo.port }
    ],
    route: {
      defaultOutbound: "fallback",
      policies: [
        {
          tag: "fallback",
          type: "failover",
          outbounds: ["bad", "good"],
          strategy: "roundRobin",
          unhealthyAfterFailures: 1,
          recoverAfterMs: 10_000
        }
      ],
      rules: []
    }
  });
  const engine = new Engine(config);
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));

  try {
    client.write("CONNECT ignored.example:443 HTTP/1.1\r\nHost: ignored.example:443\r\n\r\n");
    await readUntil(client, (buffer) => buffer.includes("200 Connection Established"));
    client.write("failover-ok");
    await readUntil(client, (buffer) => buffer.includes("failover-ok"));

    const health = engine.getOutboundHealth();
    assert.ok(health.find((entry) => entry.tag === "bad" && entry.failures >= 1));
    assert.ok(health.find((entry) => entry.tag === "good" && entry.successes >= 1));
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
  }
});

void test("HotReloadManager reloads config and rule changes without restarting the process", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sepigs-hot-reload-"));
  const configPath = join(dir, "sepigs.json");
  const initialRaw = {
    log: { level: "silent" },
    inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  };
  await writeFile(configPath, JSON.stringify(initialRaw), "utf8");
  const initialConfig = parseConfig(initialRaw);
  let reloaded: number | undefined;
  const manager = new HotReloadManager({
    configPath,
    initialConfig,
    debounceMs: 20,
    logger: silentLogger,
    onReload: (config) => {
      reloaded = config.route.rules.length;
      return Promise.resolve();
    }
  });

  manager.start();
  try {
    await writeFile(
      configPath,
      JSON.stringify({
        ...initialRaw,
        route: { defaultOutbound: "direct", rules: [{ tag: "web", port: [8080], outboundTag: "direct" }] }
      }),
      "utf8"
    );
    await waitFor(() => reloaded === 1, 2_000);
  } finally {
    manager.stop();
  }
});
