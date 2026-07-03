import assert from "node:assert/strict";
import test from "node:test";
import { runRuntimeSmokeDns } from "../src/reload/runtimeSmokeDns.js";

void test("DNS runtime smoke isolates in-flight queries and rejects fake-IP changes", async () => {
  const report = await runRuntimeSmokeDns(
    "examples/sepigs.transactional-dns.experimental.json"
  );
  assert.equal(report.transactionState, "committed");
  assert.equal(report.generation.switched, true);
  assert.equal(report.generation.drainingAfterOldCompletion, 0);
  assert.equal(report.queryChecks.oldInFlightResult, "192.0.2.10");
  assert.equal(report.queryChecks.newGenerationResult, "192.0.2.20");
  assert.equal(report.cachePolicy.carried, 0);
  assert.ok(report.cachePolicy.dropped >= 1);
  assert.equal(report.fakeIpChange.rejected, true);
  assert.equal(report.fakeIpChange.activeGenerationUnchanged, true);
  assert.equal(report.existingConnection.survivedReload, true);
  assert.deepEqual(report.resources, {
    activeConnections: 0,
    activeSockets: 0,
    activeTimers: 0,
    activeListeners: 0
  });
});
