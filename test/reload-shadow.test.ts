import assert from "node:assert/strict";
import test from "node:test";
import { runShadowReload } from "../src/reload/shadow.js";

void test("shadow reload executes changed prototype adapters without production side effects", async () => {
  const report = await runShadowReload({
    currentPath: "examples/sepigs.json",
    candidatePath: "examples/sepigs.safe.json"
  });

  assert.equal(report.execution.success, true);
  assert.equal(report.execution.transaction.state, "committed");
  assert.ok(report.plan.changedComponents.includes("router"));
  assert.deepEqual(report.execution.preparedComponents, report.plan.changedComponents);
  assert.deepEqual(report.execution.committedComponents, report.plan.changedComponents);
  assert.deepEqual(report.sideEffects, {
    runtimeMutated: false,
    listenersOpened: 0,
    connectionsClosed: 0,
    productionEngineInvoked: false
  });
  assert.equal(report.execution.events.at(-1)?.type, "transaction.cleaned_up");
});

void test("identical shadow config produces a no-component transaction", async () => {
  const report = await runShadowReload({
    currentPath: "examples/sepigs.safe.json",
    candidatePath: "examples/sepigs.safe.json"
  });

  assert.equal(report.execution.success, true);
  assert.deepEqual(report.plan.changedComponents, []);
  assert.deepEqual(report.execution.preparedComponents, []);
  assert.equal(report.sideEffects.runtimeMutated, false);
});
