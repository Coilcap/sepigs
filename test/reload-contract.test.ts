import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../src/config/loader.js";
import {
  executeReloadOperation,
  type PreparedComponent,
  type ReloadableComponent,
  type ReloadOperationContext
} from "../src/reload/contract.js";

interface MockPrepared {
  readonly order: string[];
}

class MockReloadableComponent implements ReloadableComponent<MockPrepared> {
  public readonly name = "router" as const;
  private readonly order: string[] = [];

  public currentGeneration(): string {
    return "generation-1";
  }

  public prepare(_config: Awaited<ReturnType<typeof loadConfig>>, context: ReloadOperationContext): Promise<PreparedComponent<MockPrepared>> {
    this.order.push("prepare");
    return Promise.resolve({
      component: this.name,
      candidateGenerationId: context.candidateGenerationId,
      preparedAt: Date.now(),
      value: { order: this.order },
      resources: [],
      rollbackFailureStrategy: "keep-old-generation"
    });
  }

  public healthCheck(prepared: PreparedComponent<MockPrepared>): Promise<void> {
    prepared.value.order.push("health");
    return Promise.resolve();
  }

  public commit(prepared: PreparedComponent<MockPrepared>): Promise<void> {
    prepared.value.order.push("commit");
    return Promise.resolve();
  }

  public rollback(prepared: PreparedComponent<MockPrepared>): Promise<void> {
    prepared.value.order.push("rollback");
    return Promise.resolve();
  }

  public cleanup(prepared: PreparedComponent<MockPrepared>): Promise<void> {
    prepared.value.order.push("cleanup");
    return Promise.resolve();
  }
}

void test("reload component contract supports prepare, health, commit, and cleanup ordering", async () => {
  const component = new MockReloadableComponent();
  const config = await loadConfig("examples/sepigs.safe.json");
  const context = reloadContext(2_000);
  const prepared = await component.prepare(config, context);
  await component.healthCheck(prepared);
  await component.commit(prepared);
  await component.cleanup(prepared);
  assert.deepEqual(prepared.value.order, ["prepare", "health", "commit", "cleanup"]);
  assert.equal(component.currentGeneration(), "generation-1");
});

void test("reload operation timeout is bounded and reported", async () => {
  const context = reloadContext(20);
  let operationAborted = false;
  await assert.rejects(
    executeReloadOperation("slow-prepare", context, async (signal) => {
      signal.addEventListener("abort", () => {
        operationAborted = true;
      }, { once: true });
      return await new Promise<never>(() => undefined);
    }),
    /timed out/u
  );
  assert.equal(operationAborted, true);
});

void test("reload operation observes transaction abort", async () => {
  const controller = new AbortController();
  const context = reloadContext(2_000, controller.signal);
  const pending = executeReloadOperation("aborted-health-check", context, async () =>
    await new Promise<never>(() => undefined)
  );
  controller.abort();
  await assert.rejects(pending, /aborted/u);
});

const reloadContext = (timeoutMs: number, signal = new AbortController().signal): ReloadOperationContext => ({
  transactionId: "reload-test",
  oldGenerationId: "generation-1",
  candidateGenerationId: "generation-2",
  deadline: Date.now() + timeoutMs,
  signal
});
