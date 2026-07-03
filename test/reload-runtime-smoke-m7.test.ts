import assert from "node:assert/strict";
import test from "node:test";
import { runRuntimeSmokeM7 } from "../src/reload/runtimeSmokeM7.js";

void test("M7 runtime smoke switches new decisions without interrupting an established tunnel", async () => {
  const report = await runRuntimeSmokeM7(
    "examples/sepigs.transactional-router-policy.experimental.json"
  );
  assert.equal(report.transactionState, "committed");
  assert.equal(report.generations.router.switched, true);
  assert.equal(report.generations.policy.switched, true);
  assert.equal(report.connectionChecks.establishedConnectionSurvived, true);
  assert.equal(report.connectionChecks.oldDecisionAfterReload, "direct");
  assert.equal(report.connectionChecks.newDecisionAfterReload, "block");
  assert.deepEqual(report.sideEffects, {
    connectionsClosedByReload: 0,
    listenersChanged: 0,
    dnsChanged: false,
    fakeIpChanged: false
  });
  assert.deepEqual(report.resourceCleanup, {
    transactionCleanupCompleted: true,
    cleanupErrors: 0,
    activeConnections: 0,
    activeSockets: 0,
    activeTimers: 0,
    activeListeners: 0
  });
});
