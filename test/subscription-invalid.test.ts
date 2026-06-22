import assert from "node:assert/strict";
import test from "node:test";
import { parseSubscription } from "../src/subscription/parser.js";

void test("malformed subscription input fails clearly without process crash", () => { assert.throws(() => parseSubscription("not-a-supported-uri"), /unsupported subscription URL at line 1/u); assert.throws(() => parseSubscription("ss://broken"), /invalid Shadowsocks URL/u); });
