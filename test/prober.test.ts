import assert from "node:assert/strict";
import test from "node:test";
import { Logger } from "../src/logger/logger.js";
import { ActiveProber } from "../src/router/prober.js";
import { RoutingPolicyManager } from "../src/router/policy.js";

void test("ActiveProber enforces budget, records health, and applies failure backoff", async () => {
  const policy = new RoutingPolicyManager([
    {
      tag: "auto",
      type: "loadBalance",
      outbounds: ["fast", "bad", "skipped"],
      strategy: "leastLatency",
      unhealthyAfterFailures: 1,
      recoverAfterMs: 30_000
    }
  ]);
  const prober = new ActiveProber(
    {
      enabled: true,
      intervalMs: 1_000,
      timeoutMs: 50,
      maxConcurrency: 1,
      budgetPerInterval: 2,
      backoffBaseMs: 10_000,
      backoffMaxMs: 10_000
    },
    policy,
    new Logger("silent")
  );

  const first = await prober.runOnce([
    {
      tag: "fast",
      probe: () => Promise.resolve()
    },
    {
      tag: "bad",
      probe: () => Promise.reject(new Error("probe failed"))
    },
    {
      tag: "skipped",
      probe: () => Promise.resolve()
    }
  ]);
  assert.deepEqual(first, { attempted: 2, skipped: 1, succeeded: 1, failed: 1 });
  assert.equal(policy.select("auto").candidates[0], "fast");

  const second = await prober.runOnce([
    {
      tag: "bad",
      probe: () => Promise.reject(new Error("should be backed off"))
    }
  ]);
  assert.deepEqual(second, { attempted: 0, skipped: 1, succeeded: 0, failed: 0 });
  assert.equal(prober.snapshots().find((snapshot) => snapshot.tag === "bad")?.failureRate, 1);
});
