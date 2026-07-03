import { NetworkError, TimeoutError } from "../utils/errors.js";

interface SingleFlightEntry<Value> {
  readonly controller: AbortController;
  readonly promise: Promise<Value>;
}

export class GenerationSingleFlight<Value> {
  private readonly entries = new Map<string, SingleFlightEntry<Value>>();

  public constructor(private readonly generationId: string) {}

  public run(
    key: string,
    operation: (signal: AbortSignal) => Promise<Value>,
    timeoutMs?: number
  ): Promise<Value> {
    const scopedKey = `${this.generationId}:${key}`;
    const existing = this.entries.get(scopedKey);
    if (existing !== undefined) return existing.promise;

    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    let onAbort: (() => void) | undefined;
    const operationPromise = operation(controller.signal);
    const abortPromise = new Promise<never>((_resolve, reject) => {
      onAbort = () => {
        reject(new NetworkError(
          `DNS single-flight aborted for generation "${this.generationId}"`
        ));
      };
      controller.signal.addEventListener("abort", onAbort, { once: true });
    });
    const candidates: Promise<Value>[] = [operationPromise, abortPromise];
    if (timeoutMs !== undefined) {
      candidates.push(
          new Promise<never>((_resolve, reject) => {
            timer = setTimeout(() => {
              reject(new TimeoutError(
                `DNS single-flight timeout after ${String(timeoutMs)}ms`
              ));
              controller.abort();
            }, timeoutMs);
          })
      );
    }
    const boundedPromise = Promise.race(candidates);
    const promise = boundedPromise.finally(() => {
      if (timer !== undefined) clearTimeout(timer);
      if (onAbort !== undefined) {
        controller.signal.removeEventListener("abort", onAbort);
      }
      this.entries.delete(scopedKey);
    });
    this.entries.set(scopedKey, { controller, promise });
    return promise;
  }

  public size(): number {
    return this.entries.size;
  }

  public abortAll(): void {
    for (const entry of this.entries.values()) entry.controller.abort();
  }
}
