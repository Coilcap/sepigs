import { monitorEventLoopDelay } from "node:perf_hooks";

export interface EventLoopDelaySnapshot {
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly maxMs: number;
}

export class EventLoopMonitor {
  private readonly histogram = monitorEventLoopDelay({ resolution: 20 });
  private started = false;

  public start(): void {
    if (this.started) {
      return;
    }
    this.histogram.enable();
    this.started = true;
  }

  public stop(): void {
    if (!this.started) {
      return;
    }
    this.histogram.disable();
    this.started = false;
  }

  public snapshot(): EventLoopDelaySnapshot {
    return {
      p50Ms: this.histogram.percentile(50) / 1_000_000,
      p95Ms: this.histogram.percentile(95) / 1_000_000,
      p99Ms: this.histogram.percentile(99) / 1_000_000,
      maxMs: this.histogram.max / 1_000_000
    };
  }
}
