import assert from "node:assert/strict";
import test from "node:test";
import { runRuntimeSmokeM11 } from "../src/reload/runtimeSmokeM11.js";

void test("M11 runtime smoke preserves old connections and switches new outbound lookups", async () => {
  const report = await runRuntimeSmokeM11(
    "examples/sepigs.transactional-outbound.experimental.json"
  );
  assert.equal(report.generation.switched, true);
  assert.equal(report.generation.oldReferenceReadable, true);
  assert.equal(report.generation.oldDrainedAfterRelease, true);
  assert.deepEqual(report.supportedTypes, {
    direct: true,
    block: true,
    tcpRelay: true
  });
  assert.equal(report.connectionChecks.establishedConnectionSurvived, true);
  assert.equal(report.connectionChecks.newConnectionResponse, "new:request");
  assert.equal(report.connectionChecks.connectionsClosedByReload, 0);
  assert.deepEqual(report.rejectionChecks, {
    shadowsocks: true,
    trojan: true,
    activeGenerationUnchanged: true
  });
  assert.equal(report.sideEffects.listenersChanged, 0);
  assert.equal(report.sideEffects.dnsGenerationChanged, false);
  assert.equal(report.resourceCleanup.activeConnections, 0);
  assert.equal(report.resourceCleanup.activeSockets, 0);
  assert.equal(report.resourceCleanup.activeTimers, 0);
  assert.equal(report.resourceCleanup.activeListeners, 0);
});
