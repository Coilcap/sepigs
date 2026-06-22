import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardEngine, dashboardRequest, DASHBOARD_TOKEN } from "./dashboard-test-helpers.js";

void test("Dashboard rate limit rejects excess requests without logging token", async () => { const engine = createDashboardEngine({ dashboard: { enabled: true, listen: "127.0.0.1", port: 0, token: DASHBOARD_TOKEN, rateLimitPerMinute: 1 } }); await engine.start(); try { assert.equal((await dashboardRequest(engine, "/api/status")).status, 200); assert.equal((await dashboardRequest(engine, "/api/status")).status, 429); assert.doesNotMatch(JSON.stringify(engine.getStats()), new RegExp(DASHBOARD_TOKEN, "u")); } finally { await engine.stop(); } });
