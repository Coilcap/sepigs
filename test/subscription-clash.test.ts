import assert from "node:assert/strict";
import test from "node:test";
import { parseSubscription } from "../src/subscription/parser.js";

void test("subscription parser normalizes Clash proxies and preserves warnings", () => {
  const result = parseSubscription("proxies:\n  - {name: node one, type: ss, server: 127.0.0.1, port: 8388, cipher: aes-128-gcm, password: secret}\n  - {name: ignored, type: vmess, server: x, port: 1}");
  assert.equal(result.format, "clash"); assert.equal(result.outbounds[0]?.tag, "node-one"); assert.equal(result.warnings.length, 1);
});
