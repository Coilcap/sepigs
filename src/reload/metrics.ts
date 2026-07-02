import type { ReloadComponentName } from "./types.js";
import { sanitizeReloadMessage } from "./events.js";

export interface ReloadDurationMetric {
  readonly component: ReloadComponentName;
  readonly durationMs: number;
}

export interface ReloadMetricsSnapshot {
  readonly total: number;
  readonly success: number;
  readonly failure: number;
  readonly rollback: number;
  readonly componentRollback: Readonly<Partial<Record<ReloadComponentName, number>>>;
  readonly transactionDurations: readonly number[];
  readonly prepareDurations: readonly ReloadDurationMetric[];
  readonly commitDurations: readonly ReloadDurationMetric[];
  readonly currentGeneration: string;
  readonly lastFailureReason?: string;
}

export class ReloadMetrics {
  private total = 0;
  private success = 0;
  private failure = 0;
  private rollback = 0;
  private readonly componentRollback = new Map<ReloadComponentName, number>();
  private readonly transactionDurations: number[] = [];
  private readonly prepareDurations: ReloadDurationMetric[] = [];
  private readonly commitDurations: ReloadDurationMetric[] = [];
  private currentGeneration: string;
  private lastFailureReason: string | undefined;

  public constructor(initialGeneration: string) {
    this.currentGeneration = initialGeneration;
  }

  public transactionStarted(): void {
    this.total += 1;
  }

  public transactionSucceeded(generationId: string): void {
    this.success += 1;
    this.currentGeneration = generationId;
  }

  public transactionFailed(reason: string): void {
    this.failure += 1;
    this.lastFailureReason = sanitizeReloadMessage(reason);
  }

  public transactionRolledBack(): void {
    this.rollback += 1;
  }

  public componentRolledBack(component: ReloadComponentName): void {
    this.componentRollback.set(component, (this.componentRollback.get(component) ?? 0) + 1);
  }

  public recordPrepareDuration(component: ReloadComponentName, durationMs: number): void {
    pushBounded(this.prepareDurations, { component, durationMs: Math.max(0, durationMs) });
  }

  public recordCommitDuration(component: ReloadComponentName, durationMs: number): void {
    pushBounded(this.commitDurations, { component, durationMs: Math.max(0, durationMs) });
  }

  public recordTransactionDuration(durationMs: number): void {
    pushBounded(this.transactionDurations, Math.max(0, durationMs));
  }

  public snapshot(): ReloadMetricsSnapshot {
    return {
      total: this.total,
      success: this.success,
      failure: this.failure,
      rollback: this.rollback,
      componentRollback: Object.fromEntries(this.componentRollback),
      transactionDurations: [...this.transactionDurations],
      prepareDurations: this.prepareDurations.map((metric) => ({ ...metric })),
      commitDurations: this.commitDurations.map((metric) => ({ ...metric })),
      currentGeneration: this.currentGeneration,
      ...(this.lastFailureReason === undefined ? {} : { lastFailureReason: this.lastFailureReason })
    };
  }
}

const MAX_DURATION_SAMPLES = 256;

const pushBounded = <Value>(values: Value[], value: Value): void => {
  values.push(value);
  if (values.length > MAX_DURATION_SAMPLES) values.shift();
};
