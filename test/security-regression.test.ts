import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { Logger } from "../src/logger/logger.js";
import { ChildProcessPluginRunner } from "../src/plugin/runners/childProcessRunner.js";
import { loadPluginManifest } from "../src/plugin/manifest.js";
import { closeSocket } from "../src/utils/net.js";
import { connectClient, getPort, readUntil, startTcpEchoServer } from "./helpers.js";

void test("default inbound and metrics config do not listen on public interfaces", () => {
  const config = parseConfig({
    inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 8080 }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });
  assert.equal(config.inbounds[0]?.listen, "127.0.0.1");
  assert.equal(config.observability.metrics.listen, "127.0.0.1");
  assert.equal(config.observability.metrics.enabled, false);
});

void test("public HTTP/SOCKS and metrics listeners are rejected unless inbound auth is enabled", () => {
  assert.throws(
    () =>
      parseConfig({
        inbounds: [{ type: "http", tag: "public-http", listen: "0.0.0.0", port: 8080 }],
        outbounds: [{ type: "direct", tag: "direct" }],
        route: { defaultOutbound: "direct", rules: [] }
      }),
    /public HTTP\/SOCKS listeners must enable authentication/u
  );
  assert.throws(
    () =>
      parseConfig({
        observability: { metrics: { enabled: true, listen: "0.0.0.0", port: 19090, path: "/metrics" } },
        inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 8080 }],
        outbounds: [{ type: "direct", tag: "direct" }],
        route: { defaultOutbound: "direct", rules: [] }
      }),
    /metrics\.listen must not be public/u
  );
  const publicWithAuth = parseConfig({
    inbounds: [{ type: "socks5", tag: "public-socks", listen: "0.0.0.0", port: 1080, auth: { username: "u", password: "p" } }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });
  assert.equal(publicWithAuth.inbounds[0]?.listen, "0.0.0.0");
});

void test("future config versions are rejected", () => {
  assert.throws(
    () =>
      parseConfig({
        configVersion: 999,
        inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 8080 }],
        outbounds: [{ type: "direct", tag: "direct" }],
        route: { defaultOutbound: "direct", rules: [] }
      }),
    /configVersion 999 is not supported/u
  );
});

void test("wrong HTTP auth cannot establish a proxied connection and does not echo the password", async () => {
  const echo = await startTcpEchoServer();
  const captured: string[] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.log = (message?: unknown, ...optional: unknown[]) => {
    captured.push([message, ...optional].join(" "));
  };
  console.warn = (message?: unknown, ...optional: unknown[]) => {
    captured.push([message, ...optional].join(" "));
  };
  console.error = (message?: unknown, ...optional: unknown[]) => {
    captured.push([message, ...optional].join(" "));
  };

  const engine = new Engine(
    parseConfig({
      log: { level: "debug" },
      inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0, auth: { username: "user", password: "secret-pass" } }],
      outbounds: [{ type: "direct", tag: "direct" }],
      route: { defaultOutbound: "direct", rules: [] }
    }),
    new Logger("debug")
  );
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));
  try {
    client.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\nProxy-Authorization: Basic bad\r\n\r\n`);
    const response = await readUntil(client, (buffer) => buffer.includes("\r\n\r\n"));
    assert.match(response.toString("latin1"), /407 Proxy Authentication Required/u);
    assert.doesNotMatch(response.toString("latin1"), /secret-pass/u);
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
  }
  assert.doesNotMatch(captured.join("\n"), /secret-pass/u);
});

void test("plugins without outbound registration permission are rejected", async () => {
  const engine = new Engine(
    parseConfig({
      log: { level: "silent" },
      plugins: {
        isolation: { mode: "worker-thread", timeoutMs: 1_000 },
        modules: [{ tag: "remote-denied", enabled: true, path: "plugins/remote-denied-outbound/manifest.json" }]
      },
      inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
      outbounds: [{ type: "plugin.remoteDenied", tag: "remote-denied", options: {} }],
      route: { defaultOutbound: "remote-denied", rules: [] }
    })
  );
  await assert.rejects(async () => {
    await engine.start();
  }, /outbound:register/u);
  await engine.stop();
});

void test("child-process plugin crash is contained in the runner", async () => {
  const manifest = await loadPluginManifest("plugins/crash-plugin/manifest.json");
  const runner = new ChildProcessPluginRunner(
    { tag: "crash", enabled: true, path: "plugins/crash-plugin/manifest.json" },
    manifest,
    { mode: "child-process", timeoutMs: 1_000, memoryLimitMb: 64, stdoutLimitBytes: 4096 }
  );
  await runner.setup();
  await assert.rejects(async () => {
    await runner.start();
  }, /exited with code 42/u);
  assert.ok(true);
});
