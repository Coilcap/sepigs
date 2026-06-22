import assert from "node:assert/strict";
import test from "node:test";
import { parseSubscription } from "../src/subscription/parser.js";

void test("subscription de-duplication and generated tags are stable", () => { const uri = `ss://${Buffer.from("aes-128-gcm:secret@127.0.0.1:8388").toString("base64url")}`; const first = parseSubscription(`${uri}#same node\n${uri}#other`).outbounds; const second = parseSubscription(`${uri}#same node\n${uri}#other`).outbounds; assert.deepEqual(first, second); assert.equal(first.length, 1); assert.equal(first[0]?.tag, "same-node"); });
