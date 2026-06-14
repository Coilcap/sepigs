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
    this.services.push(service);
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

    await Promise.race([
      Promise.allSettled(stops),
      new Promise<never>((_resolve, reject) => {
        setTimeout(() => {
          reject(new Error(`shutdown timeout after ${timeoutMs}ms`));
        }, timeoutMs);
      })
    ]);

    this.started = false;
  }
}
