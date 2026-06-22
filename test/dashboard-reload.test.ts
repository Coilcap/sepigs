import assert from "node:assert/strict";
import test from "node:test";
import { createDashboardEngine, dashboardRequest } from "./dashboard-test-helpers.js";

void test("Dashboard reload failure is contained and leaves the running engine available", async () => { const engine = createDashboardEngine(); let attempts = 0; engine.setConfigReloader(() => { attempts += 1; return Promise.reject(new Error("injected reload failure")); }); await engine.start(); try { assert.equal((await dashboardRequest(engine, "/api/reload", "POST")).status, 500); assert.equal(attempts, 1); assert.equal((await dashboardRequest(engine, "/api/status")).status, 200); assert.notEqual(engine.getInboundAddress("http"), null); } finally { await engine.stop(); } });
