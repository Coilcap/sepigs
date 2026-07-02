import type { SepigsConfig } from "../../src/config/types.js";
import type {
  PreparedComponent,
  ReloadableComponent,
  ReloadOperationContext
} from "../../src/reload/contract.js";
import type { ReloadComponentName } from "../../src/reload/types.js";

export interface MockPreparedValue {
  readonly component: ReloadComponentName;
  released: boolean;
}

export interface MockReloadBehavior {
  readonly failPrepare?: boolean;
  readonly failHealth?: boolean;
  readonly failCommit?: boolean;
  readonly failRollback?: boolean;
  readonly prepareDelayMs?: number;
}

export class MockReloadComponent implements ReloadableComponent<MockPreparedValue> {
  private generation: string;
  public cleanupCount = 0;
  public rollbackCount = 0;

  public constructor(
    public readonly name: ReloadComponentName,
    private readonly journal: string[],
    private readonly behavior: MockReloadBehavior = {},
    generation = "generation-old"
  ) {
    this.generation = generation;
  }

  public currentGeneration(): string {
    return this.generation;
  }

  public async prepare(
    _config: SepigsConfig,
    context: ReloadOperationContext
  ): Promise<PreparedComponent<MockPreparedValue>> {
    this.journal.push(`${this.name}.prepare`);
    if (this.behavior.prepareDelayMs !== undefined) {
      await abortableDelay(this.behavior.prepareDelayMs, context.signal);
    }
    if (this.behavior.failPrepare === true) throw new Error(`${this.name} prepare failed`);
    return {
      component: this.name,
      candidateGenerationId: context.candidateGenerationId,
      preparedAt: Date.now(),
      value: { component: this.name, released: false },
      resources: [],
      rollbackFailureStrategy: "keep-old-generation"
    };
  }

  public healthCheck(): Promise<void> {
    this.journal.push(`${this.name}.health`);
    if (this.behavior.failHealth === true) {
      return Promise.reject(new Error(`${this.name} health failed`));
    }
    return Promise.resolve();
  }

  public commit(
    prepared: PreparedComponent<MockPreparedValue>
  ): Promise<void> {
    this.journal.push(`${this.name}.commit`);
    if (this.behavior.failCommit === true) {
      return Promise.reject(new Error(`${this.name} commit failed`));
    }
    this.generation = prepared.candidateGenerationId;
    return Promise.resolve();
  }

  public rollback(
    prepared: PreparedComponent<MockPreparedValue>,
    context: ReloadOperationContext
  ): Promise<void> {
    void prepared;
    this.journal.push(`${this.name}.rollback`);
    this.rollbackCount += 1;
    if (this.behavior.failRollback === true) {
      return Promise.reject(new Error(`${this.name} rollback failed`));
    }
    this.generation = context.oldGenerationId;
    return Promise.resolve();
  }

  public cleanup(
    prepared: PreparedComponent<MockPreparedValue>
  ): Promise<void> {
    this.journal.push(`${this.name}.cleanup`);
    this.cleanupCount += 1;
    prepared.value.released = true;
    return Promise.resolve();
  }
}

export const successComponent = (
  name: ReloadComponentName,
  journal: string[] = []
): MockReloadComponent => new MockReloadComponent(name, journal);

export const prepareFailureComponent = (
  name: ReloadComponentName,
  journal: string[] = []
): MockReloadComponent => new MockReloadComponent(name, journal, { failPrepare: true });

export const healthFailureComponent = (
  name: ReloadComponentName,
  journal: string[] = []
): MockReloadComponent => new MockReloadComponent(name, journal, { failHealth: true });

export const commitFailureComponent = (
  name: ReloadComponentName,
  journal: string[] = []
): MockReloadComponent => new MockReloadComponent(name, journal, { failCommit: true });

export const rollbackFailureComponent = (
  name: ReloadComponentName,
  journal: string[] = []
): MockReloadComponent => new MockReloadComponent(name, journal, { failRollback: true });

export const slowComponent = (
  name: ReloadComponentName,
  delayMs: number,
  journal: string[] = []
): MockReloadComponent => new MockReloadComponent(name, journal, { prepareDelayMs: delayMs });

export const cleanupTrackingComponent = successComponent;

export const generationAwareComponent = successComponent;

const abortableDelay = async (delayMs: number, signal: AbortSignal): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const finish = (error?: Error): void => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
      if (error === undefined) resolve();
      else reject(error);
    };
    const onAbort = (): void => {
      finish(new Error("mock prepare aborted"));
    };
    const timer = setTimeout(() => {
      finish();
    }, delayMs);
    signal.addEventListener("abort", onAbort, { once: true });
    if (signal.aborted) onAbort();
  });
};
