import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { closeSocket } from "../src/utils/net.js";
import { connectClient, getPort, readBytes, readUntil, startTcpEchoServer } from "./helpers.js";

void test("HTTP proxy Basic Auth rejects missing credentials and accepts valid credentials", async () => {
  const echo = await startTcpEchoServer();
  const config = parseConfig({
    log: { level: "silent" },
    limits: { connectTimeoutMs: 500, handshakeTimeoutMs: 500, idleTimeoutMs: 1_000 },
    inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0, auth: { username: "user", password: "pass" } }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });
  const engine = new Engine(config);
  await engine.start();
  const port = getPort(engine.getInboundAddress("http-in"));
  const missing = await connectClient(port);
  const valid = await connectClient(port);

  try {
    missing.write(`CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\n\r\n`);
    const rejected = await readUntil(missing, (buffer) => buffer.includes("\r\n\r\n"));
    assert.match(rejected.toString("latin1"), /407 Proxy Authentication Required/u);

    const token = Buffer.from("user:pass").toString("base64");
    valid.write(
      `CONNECT 127.0.0.1:${echo.port} HTTP/1.1\r\nHost: 127.0.0.1:${echo.port}\r\nProxy-Authorization: Basic ${token}\r\n\r\n`
    );
    await readUntil(valid, (buffer) => buffer.includes("200 Connection Established"));
    valid.write("auth-ok");
    await readUntil(valid, (buffer) => buffer.includes("auth-ok"));
  } finally {
    closeSocket(missing);
    closeSocket(valid);
    await engine.stop();
    await echo.close();
  }
});

void test("SOCKS5 username/password auth rejects bad credentials and accepts valid credentials", async () => {
  const echo = await startTcpEchoServer();
  const config = parseConfig({
    log: { level: "silent" },
    limits: { connectTimeoutMs: 500, handshakeTimeoutMs: 500, idleTimeoutMs: 1_000 },
    inbounds: [{ type: "socks5", tag: "socks-in", listen: "127.0.0.1", port: 0, auth: { username: "user", password: "pass" } }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });
  const engine = new Engine(config);
  await engine.start();
  const port = getPort(engine.getInboundAddress("socks-in"));
  const bad = await connectClient(port);
  const valid = await connectClient(port);

  try {
    bad.write(Buffer.from([0x05, 0x01, 0x00]));
    assert.deepEqual(await readBytes(bad, 2), Buffer.from([0x05, 0xff]));

    valid.write(Buffer.from([0x05, 0x01, 0x02]));
    assert.deepEqual(await readBytes(valid, 2), Buffer.from([0x05, 0x02]));
    valid.write(Buffer.concat([Buffer.from([0x01, 0x04]), Buffer.from("user"), Buffer.from([0x04]), Buffer.from("pass")]));
    assert.deepEqual(await readBytes(valid, 2), Buffer.from([0x01, 0x00]));
    valid.write(Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x01, 127, 0, 0, 1]), Buffer.from([(echo.port >> 8) & 0xff, echo.port & 0xff])]));
    const reply = await readBytes(valid, 10);
    assert.equal(reply[1], 0x00);
    valid.write("socks-auth-ok");
    await readUntil(valid, (buffer) => buffer.includes("socks-auth-ok"));
  } finally {
    closeSocket(bad);
    closeSocket(valid);
    await engine.stop();
    await echo.close();
  }
});
