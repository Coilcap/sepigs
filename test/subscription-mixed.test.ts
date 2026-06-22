import assert from "node:assert/strict";
import test from "node:test";
import { parseSubscription } from "../src/subscription/parser.js";

void test("mixed URI subscriptions parse SS and Trojan while structured formats warn on unsupported fields", () => { const ss = Buffer.from("aes-256-gcm:secret@127.0.0.1:8388").toString("base64url"); const mixed = parseSubscription(`ss://${ss}#ss\ntrojan://secret@127.0.0.1:443#trojan`); assert.deepEqual(mixed.outbounds.map((item) => item.type), ["shadowsocks", "trojan"]); const clash = parseSubscription("proxies:\n  - {name: unsupported, type: vmess, server: example.test, port: 443}"); assert.equal(clash.outbounds.length, 0); assert.equal(clash.warnings.length, 1); });
