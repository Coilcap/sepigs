import assert from "node:assert/strict";
import test from "node:test";
import { UdpSessionManager } from "../src/core/udpSessionManager.js";
import { StatsTracker } from "../src/core/stats.js";
import { Logger } from "../src/logger/logger.js";
import { waitFor } from "./helpers.js";

void test("UDP session manager enforces limits and reclaims idle sessions", async () => {
  const stats = new StatsTracker(); let closed = 0;
  const manager = new UdpSessionManager(1, 30, stats, new Logger("silent"));
  const session = manager.open("one", { host: "127.0.0.1", port: 1000 }, () => { closed += 1; });
  assert.ok(session); session.upload({ host: "1.1.1.1", port: 53, addressType: "ipv4" }, 12); session.download(24);
  assert.equal(manager.open("two", { host: "127.0.0.1", port: 1001 }, () => undefined), undefined);
  await waitFor(() => manager.list().length === 0, 500);
  assert.equal(closed, 1);
  assert.equal(stats.snapshot().udpSessionsTotal, 1);
  assert.equal(stats.snapshot().udpErrorsTotal, 1);
});
