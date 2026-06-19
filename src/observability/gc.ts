import { PerformanceObserver } from "node:perf_hooks";

export interface GcSnapshot {
  readonly count: number;
  readonly totalDurationMs: number;
  readonly maxDurationMs: number;
}

export class GcMonitor {
  private count = 0;
  private totalDurationMs = 0;
  private maxDurationMs = 0;
  private observer: PerformanceObserver | undefined;

  public start(): void {
    if (this.observer !== undefined) {
      return;
    }
    this.observer = new PerformanceObserver((items) => {
      for (const entry of items.getEntries()) {
        this.count += 1;
        this.totalDurationMs += entry.duration;
        this.maxDurationMs = Math.max(this.maxDurationMs, entry.duration);
      }
    });
    this.observer.observe({ entryTypes: ["gc"] });
  }

  public stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }

  public snapshot(): GcSnapshot {
    return {
      count: this.count,
      totalDurationMs: this.totalDurationMs,
      maxDurationMs: this.maxDurationMs
    };
  }
}
