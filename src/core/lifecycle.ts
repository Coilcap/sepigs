export interface Startable {
  start(): Promise<void>;
}

export interface Stoppable {
  stop(): Promise<void>;
}

export class LifecycleManager {
  private readonly services: Stoppable[] = [];
  private started = false;

  public register(service: Stoppable): void {
    if (!this.services.includes(service)) {
      this.services.push(service);
    }
  }

  public unregister(service: Stoppable): boolean {
    const index = this.services.indexOf(service);
    if (index < 0) {
      return false;
    }
    this.services.splice(index, 1);
    return true;
  }

  public markStarted(): void {
    this.started = true;
  }

  public async stopAll(timeoutMs: number): Promise<void> {
    if (!this.started) {
      return;
    }

    const stops = [...this.services].reverse().map(async (service) => {
      await service.stop();
    });

    let shutdownTimer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled(stops),
      new Promise<never>((_resolve, reject) => {
        shutdownTimer = setTimeout(() => {
          reject(new Error(`shutdown timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]).finally(() => {
      if (shutdownTimer !== undefined) {
        clearTimeout(shutdownTimer);
      }
    });

    this.started = false;
    this.services.length = 0;
  }
}
