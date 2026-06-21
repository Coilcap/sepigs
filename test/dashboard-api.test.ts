import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { getPort } from "./helpers.js";

void test("dashboard API requires auth and redacts configuration secrets", async () => {
  const token = "test-dashboard-token-123";
  const engine = new Engine(parseConfig({ log: { level: "silent" }, dashboard: { enabled: true, listen: "127.0.0.1", port: 0, token }, inbounds: [{ type: "http", tag: "http", listen: "127.0.0.1", port: 0, auth: { username: "u", password: "secret-pass" } }], outbounds: [{ type: "direct", tag: "direct" }], route: { defaultOutbound: "direct", rules: [] } }));
  await engine.start(); const port = getPort(engine.getDashboardAddress());
  try {
    assert.equal((await request(port, "/api/status")).status, 401);
    const config = await request(port, "/api/config", token);
    assert.equal(config.status, 200); assert.doesNotMatch(config.body, /secret-pass|test-dashboard-token-123/u); assert.match(config.body, /REDACTED/u);
  } finally { await engine.stop(); }
});

const request = async (port: number, path: string, token?: string): Promise<{ status: number; body: string }> => await new Promise((resolve, reject) => { const req = http.request({ host: "127.0.0.1", port, path, headers: token === undefined ? {} : { authorization: `Bearer ${token}` } }, (res) => { const chunks: Buffer[] = []; res.on("data", (chunk: Buffer) => chunks.push(chunk)); res.on("end", () => { resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString() }); }); }); req.on("error", reject); req.end(); });
