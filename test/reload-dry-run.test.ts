import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadDryRunReloadPlan } from "../src/reload/dryRun.js";

void test("reload dry-run detects changed components without runtime side effects", async () => {
  const plan = await loadDryRunReloadPlan("examples/sepigs.safe.json", "examples/sepigs.json");
  assert.ok(plan.changedComponents.includes("router"));
  assert.ok(plan.changedComponents.includes("policy-prober"));
  assert.ok(plan.changedComponents.includes("metrics-server"));
  assert.deepEqual(plan.sideEffects, {
    runtimeMutated: false,
    listenersOpened: 0,
    connectionsClosed: 0
  });
});

void test("reload dry-run reports reuse for identical validated configs", async () => {
  const plan = await loadDryRunReloadPlan("examples/sepigs.safe.json", "examples/sepigs.safe.json");
  assert.deepEqual(plan.changedComponents, []);
  assert.ok(plan.components.every((component) => component.action === "reuse"));
  assert.equal(plan.currentConfigHash, plan.candidateConfigHash);
});

void test("reload dry-run rejects malformed config before producing a plan", async () => {
  const directory = await mkdtemp(join(tmpdir(), "sepigs-reload-dry-run-"));
  const path = join(directory, "invalid.json");
  try {
    await writeFile(path, "{\"configVersion\": 999}", "utf8");
    await assert.rejects(
      loadDryRunReloadPlan(path, "examples/sepigs.safe.json"),
      /newer than this sepigs build supports/u
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
