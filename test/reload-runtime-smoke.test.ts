import assert from "node:assert/strict";
import test from "node:test";
import { runRuntimeSmoke } from "../src/reload/runtimeSmoke.js";

void test("runtime smoke commits control-plane components and tears down resources", async () => {
  const report = await runRuntimeSmoke("examples/sepigs.transactional-reload.experimental.json");
  assert.equal(report.rollbackStatus.transactionState, "committed");
  assert.deepEqual(report.endpointChecks, { metrics: "passed", dashboard: "passed" });
  assert.equal(report.runtimeSideEffects.dataPlaneMutated, false);
  assert.equal(report.runtimeSideEffects.legacyFallbackUsed, false);
  assert.deepEqual(report.resourceCleanup, {
    transactionCleanupCompleted: true,
    cleanupErrors: 0,
    afterStopMetricsAddress: null,
    afterStopDashboardAddress: null,
    activeConnections: 0,
    activeSockets: 0,
    activeTimers: 0,
    activeListeners: 0
  });
});
