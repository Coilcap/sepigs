import type {
  ReloadComponentDescriptor,
  ReloadGeneration,
  ReloadGenerationState,
  ReloadResourceDescriptor,
  ReloadTransaction,
  ReloadTransactionState
} from "./types.js";

const TRANSITIONS: Readonly<Record<ReloadTransactionState, readonly ReloadTransactionState[]>> = {
  idle: ["parsing"],
  parsing: ["validating", "failed"],
  validating: ["preparing", "failed"],
  preparing: ["prepared", "rolling-back", "failed"],
  prepared: ["committing", "rolling-back"],
  committing: ["committed", "rolling-back", "failed"],
  committed: [],
  "rolling-back": ["rolled-back", "failed"],
  "rolled-back": [],
  failed: []
};

export interface ReloadGenerationOptions {
  readonly id: string;
  readonly createdAt?: number;
  readonly configHash: string;
  readonly state?: ReloadGenerationState;
  readonly components?: readonly ReloadComponentDescriptor[];
  readonly resources?: readonly ReloadResourceDescriptor[];
  readonly parentGenerationId?: string;
}

export const createReloadGeneration = (options: ReloadGenerationOptions): ReloadGeneration => ({
  id: options.id,
  createdAt: options.createdAt ?? Date.now(),
  configHash: options.configHash,
  state: options.state ?? "candidate",
  components: options.components ?? [],
  resources: options.resources ?? [],
  ...(options.parentGenerationId === undefined ? {} : { parentGenerationId: options.parentGenerationId })
});

export class ReloadTransactionModel {
  private state: ReloadTransactionState = "idle";
  private completedAt: number | undefined;
  private failureReason: string | undefined;

  public constructor(
    private readonly id: string,
    private readonly oldGeneration: ReloadGeneration,
    private readonly candidateGeneration: ReloadGeneration,
    private readonly startedAt = Date.now()
  ) {}

  public transition(next: ReloadTransactionState, now = Date.now()): ReloadTransaction {
    const allowed = TRANSITIONS[this.state];
    if (!allowed.includes(next)) {
      throw new Error(`invalid reload transaction transition ${this.state} -> ${next}`);
    }
    this.state = next;
    if (isTerminal(next)) this.completedAt = now;
    return this.snapshot();
  }

  public fail(reason: string, now = Date.now()): ReloadTransaction {
    if (reason.trim().length === 0) throw new Error("reload failure reason must not be empty");
    if (isTerminal(this.state)) {
      throw new Error(`cannot fail terminal reload transaction in state ${this.state}`);
    }
    this.failureReason = reason;
    if (this.state === "preparing" || this.state === "prepared" || this.state === "committing") {
      this.state = "rolling-back";
    } else {
      this.state = "failed";
      this.completedAt = now;
    }
    return this.snapshot();
  }

  public snapshot(): ReloadTransaction {
    return {
      id: this.id,
      oldGeneration: this.oldGeneration,
      candidateGeneration: this.candidateGeneration,
      state: this.state,
      startedAt: this.startedAt,
      ...(this.completedAt === undefined ? {} : { completedAt: this.completedAt }),
      ...(this.failureReason === undefined ? {} : { failureReason: this.failureReason })
    };
  }
}

const isTerminal = (state: ReloadTransactionState): boolean =>
  state === "committed" || state === "rolled-back" || state === "failed";
