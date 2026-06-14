import type { LeakDetector } from "./leakDetector.js";

export interface ManagedTimer {
  readonly label: string;
  refresh(timeoutMs?: number): void;
  clear(): void;
}

class ManagedTimerImpl implements ManagedTimer {
  public readonly label: string;
  private readonly callback: () => void;
  private readonly leakDetector: LeakDetector;
  private timeoutMs: number;
  private timer: NodeJS.Timeout | undefined;
  private cleanup: (() => void) | undefined;

  public constructor(label: string, timeoutMs: number, callback: () => void, leakDetector: LeakDetector) {
    this.label = label;
    this.timeoutMs = timeoutMs;
    this.callback = callback;
    this.leakDetector = leakDetector;
    this.arm();
  }

  public refresh(timeoutMs?: number): void {
    if (timeoutMs !== undefined) {
      this.timeoutMs = timeoutMs;
    }
    this.clear();
    this.arm();
  }

  public clear(): void {
    if (this.timer !== undefined) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
    this.cleanup?.();
    this.cleanup = undefined;
  }

  private arm(): void {
    this.timer = setTimeout(() => {
      this.clear();
      this.callback();
    }, this.timeoutMs);
    this.timer.unref();
    this.cleanup = this.leakDetector.trackTimer(this.timer, this.label);
  }
}

export class TimeoutManager {
  private readonly leakDetector: LeakDetector;
  private readonly timers = new Set<ManagedTimerImpl>();

  public constructor(leakDetector: LeakDetector) {
    this.leakDetector = leakDetector;
  }

  public createTimeout(label: string, timeoutMs: number, callback: () => void): ManagedTimer {
    const timer = new ManagedTimerImpl(label, timeoutMs, callback, this.leakDetector);
    this.timers.add(timer);
    return {
      label,
      refresh: (nextTimeoutMs?: number) => {
        timer.refresh(nextTimeoutMs);
      },
      clear: () => {
        timer.clear();
        this.timers.delete(timer);
      }
    };
  }

  public setInterval(label: string, intervalMs: number, callback: () => void): ManagedTimer {
    const timer = setInterval(callback, intervalMs);
    timer.unref();
    const cleanup = this.leakDetector.trackTimer(timer, `interval:${label}`);
    let cleared = false;

    return {
      label,
      refresh: () => undefined,
      clear: () => {
        if (cleared) {
          return;
        }
        cleared = true;
        clearInterval(timer);
        cleanup();
      }
    };
  }

  public clearAll(): void {
    for (const timer of this.timers) {
      timer.clear();
    }
    this.timers.clear();
  }
}
