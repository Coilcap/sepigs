import type { ProbingConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { TimeoutError } from "../utils/errors.js";
import type { RoutingPolicyManager } from "./policy.js";
import { HealthStore, type HealthSnapshot } from "./health.js";

export interface ProbeTarget {
  readonly tag: string;
  probe(): Promise<void>;
}

interface ProbeState {
  failures: number;
  nextAllowedAt: number;
}

export interface ProbeRunSummary {
  readonly attempted: number;
  readonly skipped: number;
  readonly succeeded: number;
  readonly failed: number;
}

export class ActiveProber {
  private readonly config: ProbingConfig;
  private readonly healthStore: HealthStore;
  private readonly policyManager: RoutingPolicyManager;
  private readonly logger: Logger;
  private readonly states = new Map<string, ProbeState>();
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  public constructor(config: ProbingConfig, policyManager: RoutingPolicyManager, logger: Logger, healthStore = new HealthStore()) {
    this.config = config;
    this.policyManager = policyManager;
    this.logger = logger;
    this.healthStore = healthStore;
  }

  public start(targets: () => readonly ProbeTarget[]): void {
    if (!this.config.enabled || this.timer !== undefined) {
      return;
    }
    this.timer = setInterval(() => {
      void this.runOnce(targets());
    }, this.config.intervalMs);
    this.timer.unref();
  }

  public stop(): void {
    if (this.timer !== undefined) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  public async runOnce(targets: readonly ProbeTarget[]): Promise<ProbeRunSummary> {
    if (this.running) {
      return { attempted: 0, skipped: targets.length, succeeded: 0, failed: 0 };
    }
    this.running = true;
    try {
      const runnable = targets.filter((target) => this.canProbe(target.tag)).slice(0, this.config.budgetPerInterval);
      let succeeded = 0;
      let failed = 0;
      let nextIndex = 0;

      const workers = Array.from({ length: Math.min(this.config.maxConcurrency, runnable.length) }, async () => {
        while (nextIndex < runnable.length) {
          const target = runnable[nextIndex];
          nextIndex += 1;
          if (target === undefined) {
            continue;
          }
          const ok = await this.probeTarget(target);
          if (ok) {
            succeeded += 1;
          } else {
            failed += 1;
          }
        }
      });
      await Promise.all(workers);
      return {
        attempted: runnable.length,
        skipped: targets.length - runnable.length,
        succeeded,
        failed
      };
    } finally {
      this.running = false;
    }
  }

  public snapshots(): readonly HealthSnapshot[] {
    return this.healthStore.snapshots();
  }

  private async probeTarget(target: ProbeTarget): Promise<boolean> {
    const startedAt = performance.now();
    try {
      await withTimeout(target.probe(), this.config.timeoutMs);
      const latencyMs = performance.now() - startedAt;
      this.recordSuccess(target.tag, latencyMs);
      return true;
    } catch (error) {
      const latencyMs = performance.now() - startedAt;
      this.recordFailure(target.tag, latencyMs);
      this.logger.debug("active probe failed", { tag: target.tag, error: error instanceof Error ? error.message : String(error) });
      return false;
    }
  }

  private recordSuccess(tag: string, latencyMs: number): void {
    this.states.set(tag, { failures: 0, nextAllowedAt: 0 });
    this.healthStore.record({ tag, ok: true, latencyMs, timestamp: Date.now() });
    this.policyManager.recordSuccess(tag, latencyMs);
  }

  private recordFailure(tag: string, latencyMs: number): void {
    const previous = this.states.get(tag) ?? { failures: 0, nextAllowedAt: 0 };
    const failures = previous.failures + 1;
    const backoffMs = Math.min(this.config.backoffMaxMs, this.config.backoffBaseMs * 2 ** Math.min(failures - 1, 16));
    this.states.set(tag, { failures, nextAllowedAt: Date.now() + backoffMs });
    this.healthStore.record({ tag, ok: false, latencyMs, timestamp: Date.now() });
    this.policyManager.recordFailure(tag);
  }

  private canProbe(tag: string): boolean {
    const state = this.states.get(tag);
    return state === undefined || state.nextAllowedAt <= Date.now();
  }
}

const withTimeout = async (promise: Promise<void>, timeoutMs: number): Promise<void> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new TimeoutError(`probe timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref();
      })
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};
