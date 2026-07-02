import type { SepigsConfig } from "../config/types.js";
import {
  executeReloadOperation,
  type PreparedComponent,
  type ReloadableComponent,
  type ReloadOperationContext
} from "./contract.js";
import { ReloadEventLog, type ReloadPhase } from "./events.js";
import { ReloadTransactionModel } from "./generation.js";
import { ReloadMetrics, type ReloadMetricsSnapshot } from "./metrics.js";
import type {
  ReloadComponentName,
  ReloadGeneration,
  ReloadTransaction
} from "./types.js";

export type ReloadFailureStage =
  | "parse"
  | "validate"
  | "prepare"
  | "health"
  | "commit"
  | "rollback"
  | "cleanup";

export interface ReloadComponentError {
  readonly component?: ReloadComponentName;
  readonly stage: ReloadFailureStage;
  readonly message: string;
}

export interface ReloadExecutorOptions {
  readonly transactionId: string;
  readonly oldGeneration: ReloadGeneration;
  readonly candidateGeneration: ReloadGeneration;
  readonly config: SepigsConfig;
  readonly components: readonly ReloadableComponent[];
  readonly timeoutMs: number;
  readonly signal?: AbortSignal;
  readonly parse?: (signal: AbortSignal) => Promise<void>;
  readonly validate?: (signal: AbortSignal) => Promise<void>;
  readonly eventLog?: ReloadEventLog;
  readonly metrics?: ReloadMetrics;
}

export interface ReloadExecutionResult {
  readonly success: boolean;
  readonly transaction: ReloadTransaction;
  readonly failureReason?: string;
  readonly componentErrors: readonly ReloadComponentError[];
  readonly preparedComponents: readonly ReloadComponentName[];
  readonly committedComponents: readonly ReloadComponentName[];
  readonly events: ReturnType<ReloadEventLog["snapshot"]>;
  readonly metrics: ReloadMetricsSnapshot;
}

interface PreparedEntry {
  readonly component: ReloadableComponent;
  readonly prepared: PreparedComponent;
}

export class ReloadExecutor {
  private readonly eventLog: ReloadEventLog;
  private readonly metrics: ReloadMetrics;
  private readonly model: ReloadTransactionModel;
  private readonly componentErrors: ReloadComponentError[] = [];
  private readonly preparedEntries: PreparedEntry[] = [];
  private readonly committedEntries: PreparedEntry[] = [];
  private readonly controller = new AbortController();
  private readonly context: ReloadOperationContext;
  private originalFailure: Error | undefined;
  private timeout: NodeJS.Timeout | undefined;
  private externalAbortListener: (() => void) | undefined;
  private primaryFailureStage: ReloadFailureStage | undefined;

  public constructor(private readonly options: ReloadExecutorOptions) {
    if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
      throw new Error("reload executor timeoutMs must be a positive finite number");
    }
    this.eventLog = options.eventLog ?? new ReloadEventLog();
    this.metrics = options.metrics ?? new ReloadMetrics(options.oldGeneration.id);
    this.model = new ReloadTransactionModel(
      options.transactionId,
      options.oldGeneration,
      options.candidateGeneration
    );
    this.context = {
      transactionId: options.transactionId,
      oldGenerationId: options.oldGeneration.id,
      candidateGenerationId: options.candidateGeneration.id,
      deadline: Date.now() + options.timeoutMs,
      signal: this.controller.signal
    };
  }

  public async execute(): Promise<ReloadExecutionResult> {
    this.bindAbort();
    this.metrics.transactionStarted();
    this.event("transaction.started");
    try {
      await this.runSimplePhase("parse", "parsing", this.options.parse);
      await this.runSimplePhase("validate", "validating", this.options.validate);
      this.model.transition("preparing");
      await this.runPrepare();
      this.model.transition("prepared");
      await this.runHealthChecks();
      this.model.transition("committing");
      await this.runCommit();
      this.model.transition("committed");
      this.metrics.transactionSucceeded(this.options.candidateGeneration.id);
      this.event("transaction.committed");
    } catch (error: unknown) {
      this.originalFailure = toError(error);
      this.metrics.transactionFailed(this.originalFailure.message);
      if (!isTerminal(this.model.snapshot().state)) {
        this.model.fail(this.originalFailure.message);
      }
      this.event("transaction.failed", undefined, undefined, this.originalFailure.message);
      if (this.model.snapshot().state === "rolling-back") {
        await this.runRollback();
        this.model.transition("rolled-back");
        this.metrics.transactionRolledBack();
        this.event("transaction.rolled_back");
      }
    } finally {
      await this.runCleanup();
      this.unbindAbort();
    }
    this.metrics.recordTransactionDuration(Date.now() - this.model.snapshot().startedAt);
    return this.result();
  }

  private async runSimplePhase(
    phase: "parse" | "validate",
    state: "parsing" | "validating",
    operation: ((signal: AbortSignal) => Promise<void>) | undefined
  ): Promise<void> {
    this.model.transition(state);
    const started = Date.now();
    this.event("transaction.phase.started", undefined, phase);
    try {
      await executeReloadOperation(phase, this.context, operation ?? (() => Promise.resolve()));
      this.event("transaction.phase.completed", undefined, phase, undefined, Date.now() - started);
    } catch (error: unknown) {
      this.recordError(phase, error);
      throw error;
    }
  }

  private async runPrepare(): Promise<void> {
    const phaseStarted = Date.now();
    this.event("transaction.phase.started", undefined, "prepare");
    for (const component of this.options.components) {
      const started = Date.now();
      this.event("component.prepare.started", component.name, "prepare");
      try {
        const prepared = await executeReloadOperation(
          `${component.name}.prepare`,
          this.context,
          async (signal) => await component.prepare(this.options.config, this.operationContext(signal))
        );
        this.preparedEntries.push({ component, prepared });
        const durationMs = Date.now() - started;
        this.metrics.recordPrepareDuration(component.name, durationMs);
        this.event("component.prepare.completed", component.name, "prepare", undefined, durationMs);
      } catch (error: unknown) {
        this.recordError("prepare", error, component.name);
        this.event("component.prepare.failed", component.name, "prepare", errorMessage(error), Date.now() - started);
        throw error;
      }
    }
    this.event("transaction.phase.completed", undefined, "prepare", undefined, Date.now() - phaseStarted);
  }

  private async runHealthChecks(): Promise<void> {
    const phaseStarted = Date.now();
    this.event("transaction.phase.started", undefined, "health");
    for (const entry of this.preparedEntries) {
      try {
        await executeReloadOperation(
          `${entry.component.name}.health`,
          this.context,
          async (signal) => {
            await entry.component.healthCheck(entry.prepared, this.operationContext(signal));
          }
        );
      } catch (error: unknown) {
        this.recordError("health", error, entry.component.name);
        this.event("component.health.failed", entry.component.name, "health", errorMessage(error));
        throw error;
      }
    }
    this.event("transaction.phase.completed", undefined, "health", undefined, Date.now() - phaseStarted);
  }

  private async runCommit(): Promise<void> {
    const phaseStarted = Date.now();
    this.event("transaction.phase.started", undefined, "commit");
    for (const entry of this.preparedEntries) {
      const started = Date.now();
      this.event("component.commit.started", entry.component.name, "commit");
      try {
        await executeReloadOperation(
          `${entry.component.name}.commit`,
          this.context,
          async (signal) => {
            await entry.component.commit(entry.prepared, this.operationContext(signal));
          }
        );
        this.committedEntries.push(entry);
        const durationMs = Date.now() - started;
        this.metrics.recordCommitDuration(entry.component.name, durationMs);
        this.event("component.commit.completed", entry.component.name, "commit", undefined, durationMs);
      } catch (error: unknown) {
        this.recordError("commit", error, entry.component.name);
        this.event("component.commit.failed", entry.component.name, "commit", errorMessage(error), Date.now() - started);
        throw error;
      }
    }
    this.event("transaction.phase.completed", undefined, "commit", undefined, Date.now() - phaseStarted);
  }

  private async runRollback(): Promise<void> {
    const phaseStarted = Date.now();
    this.event("transaction.phase.started", undefined, "rollback");
    const rollbackEntries = this.primaryFailureStage === "commit"
      ? this.committedEntries
      : this.preparedEntries;
    for (const entry of [...rollbackEntries].reverse()) {
      this.event("component.rollback.started", entry.component.name, "rollback");
      const recoveryContext = this.recoveryContext();
      try {
        await executeReloadOperation(
          `${entry.component.name}.rollback`,
          recoveryContext,
          async (signal) => {
            await entry.component.rollback(
              entry.prepared,
              this.operationContext(signal, recoveryContext)
            );
          }
        );
        this.metrics.componentRolledBack(entry.component.name);
        this.event("component.rollback.completed", entry.component.name, "rollback");
      } catch (error: unknown) {
        this.recordError("rollback", error, entry.component.name);
        this.event("component.rollback.failed", entry.component.name, "rollback", errorMessage(error));
      }
    }
    this.event("transaction.phase.completed", undefined, "rollback", undefined, Date.now() - phaseStarted);
  }

  private async runCleanup(): Promise<void> {
    const started = Date.now();
    this.event("transaction.phase.started", undefined, "cleanup");
    for (const entry of [...this.preparedEntries].reverse()) {
      const recoveryContext = this.recoveryContext();
      try {
        await executeReloadOperation(
          `${entry.component.name}.cleanup`,
          recoveryContext,
          async (signal) => {
            await entry.component.cleanup(
              entry.prepared,
              this.operationContext(signal, recoveryContext)
            );
          }
        );
      } catch (error: unknown) {
        this.recordError("cleanup", error, entry.component.name);
      }
    }
    this.event("transaction.phase.completed", undefined, "cleanup", undefined, Date.now() - started);
    this.event("transaction.cleaned_up");
  }

  private bindAbort(): void {
    this.timeout = setTimeout(() => {
      this.controller.abort();
    }, this.options.timeoutMs);
    if (this.options.signal !== undefined) {
      this.externalAbortListener = () => {
        this.controller.abort();
      };
      if (this.options.signal.aborted) this.controller.abort();
      else this.options.signal.addEventListener("abort", this.externalAbortListener, { once: true });
    }
  }

  private unbindAbort(): void {
    if (this.timeout !== undefined) clearTimeout(this.timeout);
    if (this.options.signal !== undefined && this.externalAbortListener !== undefined) {
      this.options.signal.removeEventListener("abort", this.externalAbortListener);
    }
  }

  private recoveryContext(): ReloadOperationContext {
    const recoveryTimeoutMs = Math.max(100, Math.min(this.options.timeoutMs, 1_000));
    return {
      ...this.context,
      deadline: Date.now() + recoveryTimeoutMs,
      signal: new AbortController().signal
    };
  }

  private operationContext(
    signal: AbortSignal,
    source: ReloadOperationContext = this.context
  ): ReloadOperationContext {
    return { ...source, signal };
  }

  private event(
    type: Parameters<ReloadEventLog["append"]>[0]["type"],
    component?: ReloadComponentName,
    phase?: ReloadPhase,
    message?: string,
    durationMs?: number
  ): void {
    this.eventLog.append({
      type,
      transactionId: this.options.transactionId,
      generationId: this.options.candidateGeneration.id,
      ...(component === undefined ? {} : { component }),
      ...(phase === undefined ? {} : { phase }),
      ...(message === undefined ? {} : { message }),
      ...(durationMs === undefined ? {} : { durationMs })
    });
  }

  private recordError(stage: ReloadFailureStage, error: unknown, component?: ReloadComponentName): void {
    if (stage !== "rollback" && stage !== "cleanup" && this.primaryFailureStage === undefined) {
      this.primaryFailureStage = stage;
    }
    this.componentErrors.push({
      ...(component === undefined ? {} : { component }),
      stage,
      message: errorMessage(error)
    });
  }

  private result(): ReloadExecutionResult {
    return {
      success: this.model.snapshot().state === "committed",
      transaction: this.model.snapshot(),
      ...(this.originalFailure === undefined ? {} : { failureReason: this.originalFailure.message }),
      componentErrors: this.componentErrors.map((error) => ({ ...error })),
      preparedComponents: this.preparedEntries.map((entry) => entry.component.name),
      committedComponents: this.committedEntries.map((entry) => entry.component.name),
      events: this.eventLog.snapshot(),
      metrics: this.metrics.snapshot()
    };
  }
}

const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);

const toError = (error: unknown): Error => error instanceof Error ? error : new Error(String(error));

const isTerminal = (state: ReloadTransaction["state"]): boolean =>
  state === "committed" || state === "rolled-back" || state === "failed";
