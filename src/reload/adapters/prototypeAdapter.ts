import type { SepigsConfig } from "../../config/types.js";
import type {
  PreparedComponent,
  ReloadableComponent,
  ReloadOperationContext
} from "../contract.js";
import type { ReloadComponentName } from "../types.js";

export interface PrototypeAdapterState {
  readonly prototypeOnly: true;
  readonly component: ReloadComponentName;
  readonly capabilityBoundary: string;
  released: boolean;
}

export class PrototypeReloadAdapter implements ReloadableComponent<PrototypeAdapterState> {
  private generation: string;

  public constructor(
    public readonly name: ReloadComponentName,
    public readonly capabilityBoundary: string,
    initialGeneration = "shadow-current"
  ) {
    this.generation = initialGeneration;
  }

  public currentGeneration(): string {
    return this.generation;
  }

  public prepare(
    _config: SepigsConfig,
    context: ReloadOperationContext
  ): Promise<PreparedComponent<PrototypeAdapterState>> {
    return Promise.resolve({
      component: this.name,
      candidateGenerationId: context.candidateGenerationId,
      preparedAt: Date.now(),
      value: {
        prototypeOnly: true,
        component: this.name,
        capabilityBoundary: this.capabilityBoundary,
        released: false
      },
      resources: [],
      rollbackFailureStrategy: "keep-old-generation"
    });
  }

  public healthCheck(
    prepared: PreparedComponent<PrototypeAdapterState>
  ): Promise<void> {
    if (prepared.value.released) {
      return Promise.reject(new Error(`${this.name} prototype state was released before health check`));
    }
    return Promise.resolve();
  }

  public commit(
    prepared: PreparedComponent<PrototypeAdapterState>
  ): Promise<void> {
    this.generation = prepared.candidateGenerationId;
    return Promise.resolve();
  }

  public rollback(
    _prepared: PreparedComponent<PrototypeAdapterState>,
    context: ReloadOperationContext
  ): Promise<void> {
    this.generation = context.oldGenerationId;
    return Promise.resolve();
  }

  public cleanup(
    prepared: PreparedComponent<PrototypeAdapterState>
  ): Promise<void> {
    prepared.value.released = true;
    return Promise.resolve();
  }
}
