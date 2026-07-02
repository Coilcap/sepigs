import assert from "node:assert/strict";
import test from "node:test";
import { ReloadMetrics } from "../src/reload/metrics.js";

void test("reload metrics retain bounded transaction outcomes and component durations", () => {
  const metrics = new ReloadMetrics("generation-old");
  metrics.transactionStarted();
  metrics.recordPrepareDuration("dns", 12);
  metrics.recordCommitDuration("dns", 4);
  metrics.componentRolledBack("dns");
  metrics.transactionRolledBack();
  metrics.transactionFailed("dns health failed");

  assert.deepEqual(metrics.snapshot(), {
    total: 1,
    success: 0,
    failure: 1,
    rollback: 1,
    componentRollback: { dns: 1 },
    prepareDurations: [{ component: "dns", durationMs: 12 }],
    commitDurations: [{ component: "dns", durationMs: 4 }],
    currentGeneration: "generation-old",
    lastFailureReason: "dns health failed"
  });
});

void test("reload metrics advance generation only on success", () => {
  const metrics = new ReloadMetrics("generation-old");
  metrics.transactionStarted();
  metrics.transactionSucceeded("generation-new");

  const snapshot = metrics.snapshot();
  assert.equal(snapshot.total, 1);
  assert.equal(snapshot.success, 1);
  assert.equal(snapshot.currentGeneration, "generation-new");
});
