import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config/loader.js";
import { ReloadExecutor, type ReloadExecutorOptions } from "../src/reload/executor.js";
import { createReloadGeneration } from "../src/reload/generation.js";
import type { ReloadableComponent } from "../src/reload/contract.js";
import {
  commitFailureComponent,
  cleanupTrackingComponent,
  generationAwareComponent,
  healthFailureComponent,
  prepareFailureComponent,
  rollbackFailureComponent,
  slowComponent,
  successComponent
} from "./fixtures/reload-components.js";

const oldGeneration = createReloadGeneration({
  id: "generation-old",
  configHash: "old",
  state: "active"
});

const candidateGeneration = createReloadGeneration({
  id: "generation-new",
  configHash: "new",
  parentGenerationId: oldGeneration.id
});

void test("reload executor commits every prepared component and cleans up", async () => {
  const journal: string[] = [];
  const router = generationAwareComponent("router", journal);
  const dns = cleanupTrackingComponent("dns", journal);
  const result = await execute([router, dns]);

  assert.equal(result.success, true);
  assert.equal(result.transaction.state, "committed");
  assert.equal(router.currentGeneration(), "generation-new");
  assert.equal(dns.currentGeneration(), "generation-new");
  assert.equal(router.cleanupCount, 1);
  assert.equal(dns.cleanupCount, 1);
  assert.deepEqual(result.committedComponents, ["router", "dns"]);
  assert.equal(result.metrics.success, 1);
  assert.equal(result.metrics.currentGeneration, "generation-new");
});

void test("prepare failure rolls back and cleans earlier prepared resources", async () => {
  const journal: string[] = [];
  const router = successComponent("router", journal);
  const dns = prepareFailureComponent("dns", journal);
  const result = await execute([router, dns]);

  assert.equal(result.success, false);
  assert.equal(result.transaction.state, "rolled-back");
  assert.match(result.failureReason ?? "", /dns prepare failed/u);
  assert.equal(router.rollbackCount, 1);
  assert.equal(router.cleanupCount, 1);
  assert.equal(dns.cleanupCount, 0);
});

void test("health failure rolls back prepared components in reverse order", async () => {
  const journal: string[] = [];
  const router = successComponent("router", journal);
  const dns = healthFailureComponent("dns", journal);
  const result = await execute([router, dns]);

  assert.equal(result.success, false);
  assert.deepEqual(
    journal.filter((entry) => entry.endsWith(".rollback")),
    ["dns.rollback", "router.rollback"]
  );
  assert.deepEqual(
    journal.filter((entry) => entry.endsWith(".cleanup")),
    ["dns.cleanup", "router.cleanup"]
  );
});

void test("partial commit failure rolls back only committed components", async () => {
  const journal: string[] = [];
  const router = successComponent("router", journal);
  const dns = commitFailureComponent("dns", journal);
  const result = await execute([router, dns]);

  assert.equal(result.success, false);
  assert.deepEqual(result.committedComponents, ["router"]);
  assert.equal(router.rollbackCount, 1);
  assert.equal(dns.rollbackCount, 0);
  assert.equal(router.currentGeneration(), "generation-old");
  assert.equal(router.cleanupCount, 1);
  assert.equal(dns.cleanupCount, 1);
});

void test("first commit failure cleans prepared components without rolling them back", async () => {
  const journal: string[] = [];
  const router = commitFailureComponent("router", journal);
  const dns = successComponent("dns", journal);
  const result = await execute([router, dns]);

  assert.equal(result.success, false);
  assert.deepEqual(result.committedComponents, []);
  assert.equal(router.rollbackCount, 0);
  assert.equal(dns.rollbackCount, 0);
  assert.equal(router.cleanupCount, 1);
  assert.equal(dns.cleanupCount, 1);
});

void test("rollback failure is recorded without replacing the original commit error", async () => {
  const journal: string[] = [];
  const router = rollbackFailureComponent("router", journal);
  const dns = commitFailureComponent("dns", journal);
  const result = await execute([router, dns]);

  assert.match(result.failureReason ?? "", /dns commit failed/u);
  assert.ok(result.componentErrors.some((error) =>
    error.stage === "rollback" && /router rollback failed/u.test(error.message)
  ));
  assert.equal(result.metrics.failure, 1);
  assert.equal(result.metrics.rollback, 1);
  assert.equal(router.cleanupCount, 1);
  assert.equal(dns.cleanupCount, 1);
});

void test("transaction timeout aborts slow prepare and still compensates prepared work", async () => {
  const journal: string[] = [];
  const router = successComponent("router", journal);
  const dns = slowComponent("dns", 5_000, journal);
  const result = await execute([router, dns], { timeoutMs: 30 });

  assert.equal(result.success, false);
  assert.match(result.failureReason ?? "", /timed out|aborted/u);
  assert.equal(router.rollbackCount, 1);
  assert.equal(router.cleanupCount, 1);
  assert.equal(dns.cleanupCount, 0);
});

void test("external abort fails one transaction without skipping cleanup", async () => {
  const controller = new AbortController();
  const journal: string[] = [];
  const router = successComponent("router", journal);
  const dns = slowComponent("dns", 5_000, journal);
  setTimeout(() => {
    controller.abort();
  }, 20);
  const result = await execute([router, dns], { signal: controller.signal, timeoutMs: 2_000 });

  assert.equal(result.success, false);
  assert.match(result.failureReason ?? "", /aborted/u);
  assert.equal(router.cleanupCount, 1);
  assert.equal(result.events.at(-1)?.type, "transaction.cleaned_up");
});

void test("event stream preserves phase and terminal ordering", async () => {
  const result = await execute([successComponent("router")]);
  const types = result.events.map((event) => event.type);

  assert.equal(types[0], "transaction.started");
  assert.ok(types.indexOf("component.prepare.completed") < types.indexOf("component.commit.started"));
  assert.ok(types.indexOf("component.commit.completed") < types.indexOf("transaction.committed"));
  assert.equal(types.at(-1), "transaction.cleaned_up");
});

void test("parse failure reaches failed without invoking components", async () => {
  const journal: string[] = [];
  const config = await loadConfig("examples/sepigs.safe.json");
  const result = await new ReloadExecutor({
    transactionId: "reload-parse-failure",
    oldGeneration,
    candidateGeneration,
    config,
    components: [successComponent("router", journal)],
    timeoutMs: 2_000,
    parse: () => Promise.reject(new Error("candidate parse failed"))
  }).execute();

  assert.equal(result.transaction.state, "failed");
  assert.match(result.failureReason ?? "", /candidate parse failed/u);
  assert.deepEqual(journal, []);
  assert.equal(result.events.at(-1)?.type, "transaction.cleaned_up");
});

const execute = async (
  components: readonly ReloadableComponent[],
  overrides: Partial<Pick<ReloadExecutorOptions, "timeoutMs" | "signal">> = {}
) => {
  const config = await loadConfig("examples/sepigs.safe.json");
  return await new ReloadExecutor({
    transactionId: `reload-test-${String(Date.now())}`,
    oldGeneration,
    candidateGeneration,
    config,
    components,
    timeoutMs: overrides.timeoutMs ?? 2_000,
    ...(overrides.signal === undefined ? {} : { signal: overrides.signal })
  }).execute();
};
