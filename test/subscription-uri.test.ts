import assert from "node:assert/strict";
import test from "node:test";
import { parseSubscription } from "../src/subscription/parser.js";

void test("subscription URI parser de-duplicates nodes and generates safe tags", () => { const body = Buffer.from("aes-128-gcm:secret@127.0.0.1:8388").toString("base64url"); const result = parseSubscription(`ss://${body}#node%20one\nss://${body}#duplicate-name`); assert.equal(result.outbounds.length, 1); assert.equal(result.outbounds[0]?.tag, "node-one"); });
