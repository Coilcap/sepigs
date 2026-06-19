import assert from "node:assert/strict";
import test from "node:test";
import { createActiveSoakClock, isSoakCheckpointCompleteFor } from "../src/soak/runner.js";

void test("active soak clock excludes host/event-loop suspension from effective duration", async () => {
  const clock = createActiveSoakClock(0, 0, 0, {
    tickMs: 10,
    pauseThresholdMs: 50,
    recoveryWindowMs: 50
  });
  try {
    await sleep(25);
    const blockedAt = performance.now();
    while (performance.now() - blockedAt < 120) {
      // Fault injection: block the event loop long enough to resemble host suspension.
    }
    await sleep(25);

    assert.equal(clock.pauseCount(), 1);
    assert.ok(clock.suspendedMs() >= 80);
    assert.ok(clock.elapsedMs() < 100, `expected active elapsed below wall duration, received ${clock.elapsedMs()}`);
    assert.equal(clock.isRecoveringFromPause(), true);
  } finally {
    clock.stop();
  }
});

void test("completed short checkpoint can resume into a longer requested soak", () => {
  const checkpoint = {
    profile: "6h",
    durationMs: 600_000,
    concurrency: 128,
    startedAt: Date.now(),
    elapsedMs: 600_000,
    success: 1,
    errors: 0,
    bytes: 1,
    reloadCount: 0,
    infrastructurePauses: 0,
    suspendedMs: 0,
    latencies: [],
    errorReasons: {},
    completed: true,
    updatedAt: Date.now()
  } as const;

  assert.equal(isSoakCheckpointCompleteFor(checkpoint, 600_000), true);
  assert.equal(isSoakCheckpointCompleteFor(checkpoint, 21_600_000), false);
});

const sleep = async (timeoutMs: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
};
