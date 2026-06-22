import assert from "node:assert/strict";
import test from "node:test";
import { UdpSessionManager } from "../src/core/udpSessionManager.js";
import { StatsTracker } from "../src/core/stats.js";
import { Logger } from "../src/logger/logger.js";
import { waitFor } from "./helpers.js";

void test("UDP idle timeout closes and releases a session", async () => { let closed = 0; const stats = new StatsTracker(); const manager = new UdpSessionManager(2, 25, stats, new Logger("silent")); manager.open("idle", { host: "127.0.0.1", port: 1 }, () => { closed += 1; }); await waitFor(() => closed === 1, 500); assert.equal(manager.list().length, 0); assert.equal(stats.snapshot().udpSessionsActive, 0); await manager.stop(); });
