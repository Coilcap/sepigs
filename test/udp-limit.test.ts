import assert from "node:assert/strict";
import test from "node:test";
import { UdpSessionManager } from "../src/core/udpSessionManager.js";
import { StatsTracker } from "../src/core/stats.js";
import { Logger } from "../src/logger/logger.js";

void test("UDP max-session limit rejects excess and graceful shutdown closes accepted sessions", async () => { let closed = 0; const stats = new StatsTracker(); const manager = new UdpSessionManager(2, 1_000, stats, new Logger("silent")); assert.ok(manager.open("a", { host: "127.0.0.1", port: 1 }, () => { closed += 1; })); assert.ok(manager.open("b", { host: "127.0.0.1", port: 2 }, () => { closed += 1; })); assert.equal(manager.open("c", { host: "127.0.0.1", port: 3 }, () => undefined), undefined); await manager.stop(); assert.equal(closed, 2); assert.equal(stats.snapshot().udpErrorsTotal, 1); assert.equal(stats.snapshot().udpSessionsActive, 0); });
