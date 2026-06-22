import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardEngine, dashboardRequest, DASHBOARD_TOKEN } from "./dashboard-test-helpers.js";

void test("Dashboard config and metrics redact all authentication material", async () => { const password = "phase9-proxy-password"; const engine = createDashboardEngine({ inbounds: [{ type: "http", tag: "http", listen: "127.0.0.1", port: 0, auth: { username: "user", password } }] }); await engine.start(); try { const config = await dashboardRequest(engine, "/api/config"); const metrics = await dashboardRequest(engine, "/api/metrics"); assert.equal(config.status, 200); assert.doesNotMatch(config.body, new RegExp(`${password}|${DASHBOARD_TOKEN}`, "u")); assert.match(config.body, /REDACTED/u); assert.doesNotMatch(metrics.body, /password|token|phase9/iu); } finally { await engine.stop(); } });
