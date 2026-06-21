import assert from "node:assert/strict";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";

void test("dashboard rejects public binds, default tokens, and short tokens", () => { const base = { inbounds: [{ type: "http", tag: "http", listen: "127.0.0.1", port: 0 }], outbounds: [{ type: "direct", tag: "direct" }], route: { defaultOutbound: "direct", rules: [] } }; for (const dashboard of [{ enabled: true, listen: "0.0.0.0", port: 19091, token: "long-enough-dashboard-token" }, { enabled: true, listen: "127.0.0.1", port: 19091, token: "change-me" }, { enabled: true, listen: "127.0.0.1", port: 19091, token: "short" }]) assert.throws(() => parseConfig({ ...base, dashboard }), /dashboard/u); });
