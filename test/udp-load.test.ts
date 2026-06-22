import assert from "node:assert/strict";
import test from "node:test";
import { UdpSessionManager } from "../src/core/udpSessionManager.js";
import { StatsTracker } from "../src/core/stats.js";
import { Logger } from "../src/logger/logger.js";

void test("UDP session manager sustains repeated open/close load without residue", async () => {
  const stats = new StatsTracker(); const manager = new UdpSessionManager(64, 1_000, stats, new Logger("silent"));
  for (let batch = 0; batch < 20; batch += 1) {
    for (let index = 0; index < 64; index += 1) assert.ok(manager.open(`${batch}:${index}`, { host: "127.0.0.1", port: index }, () => undefined));
    manager.closeAll();
  }
  assert.equal(manager.list().length, 0); assert.equal(stats.snapshot().udpSessionsTotal, 1_280); assert.equal(stats.snapshot().udpSessionsActive, 0);
  await manager.stop();
});
