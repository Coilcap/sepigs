import { Worker } from "node:worker_threads";
import type { WorkerConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { RuntimeError, TimeoutError } from "../utils/errors.js";

export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type WorkerTask =
  | {
      readonly kind: "echo";
      readonly value: JsonValue;
    }
  | {
      readonly kind: "sha256";
      readonly value: string;
    };

export type WorkerTaskResult =
  | {
      readonly kind: "echo";
      readonly value: JsonValue;
    }
  | {
      readonly kind: "sha256";
      readonly value: string;
    };

interface WorkerRequest {
  readonly id: number;
  readonly task: WorkerTask;
}

interface WorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: WorkerTaskResult;
  readonly error?: string;
}

interface PendingTask {
  readonly resolve: (result: WorkerTaskResult) => void;
  readonly reject: (error: Error) => void;
  readonly timer: NodeJS.Timeout;
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isWorkerTaskResult = (value: unknown): value is WorkerTaskResult => {
  if (!isRecord(value) || typeof value.kind !== "string") {
    return false;
  }
  if (value.kind === "echo") {
    return "value" in value;
  }
  return value.kind === "sha256" && typeof value.value === "string";
};

const isWorkerResponse = (value: unknown): value is WorkerResponse => {
  if (!isRecord(value) || typeof value.id !== "number" || typeof value.ok !== "boolean") {
    return false;
  }
  if (value.ok) {
    return isWorkerTaskResult(value.result);
  }
  return typeof value.error === "string";
};

export class WorkerPool {
  private readonly config: WorkerConfig;
  private readonly logger: Logger;
  private readonly workers: Worker[] = [];
  private readonly pending = new Map<number, PendingTask>();
  private nextTaskId = 1;
  private nextWorkerIndex = 0;
  private started = false;

  public constructor(config: WorkerConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  public start(): Promise<void> {
    if (this.started || !this.config.enabled) {
      return Promise.resolve();
    }
    const workerUrl = new URL("./workerEntry.js", import.meta.url);
    for (let index = 0; index < this.config.size; index += 1) {
      const worker = new Worker(workerUrl, { name: `sepigs-worker-${index}` });
      worker.on("message", (message: unknown) => {
        this.handleMessage(message);
      });
      worker.on("error", (error) => {
        this.logger.error("worker failed", { error: error.message });
      });
      worker.on("exit", (code) => {
        if (code !== 0) {
          this.logger.warn("worker exited unexpectedly", { code });
        }
      });
      this.workers.push(worker);
    }
    this.started = true;
    return Promise.resolve();
  }

  public async run(task: WorkerTask): Promise<WorkerTaskResult> {
    if (!this.config.enabled) {
      throw new RuntimeError("worker pool is disabled");
    }
    if (!this.started) {
      await this.start();
    }
    const worker = this.pickWorker();
    const id = this.nextTaskId;
    this.nextTaskId += 1;

    return await new Promise<WorkerTaskResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new TimeoutError(`worker task timed out after ${this.config.taskTimeoutMs}ms`));
      }, this.config.taskTimeoutMs);
      timer.unref();
      this.pending.set(id, { resolve, reject, timer });
      worker.postMessage({ id, task } satisfies WorkerRequest);
    });
  }

  public async stop(): Promise<void> {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new RuntimeError("worker pool stopped"));
    }
    this.pending.clear();

    await Promise.all(
      this.workers.splice(0).map(async (worker) => {
        await worker.terminate();
      })
    );
    this.started = false;
  }

  public snapshot(): { readonly enabled: boolean; readonly size: number; readonly pendingTasks: number } {
    return {
      enabled: this.config.enabled,
      size: this.workers.length,
      pendingTasks: this.pending.size
    };
  }

  private pickWorker(): Worker {
    if (this.workers.length === 0) {
      throw new RuntimeError("worker pool has no workers");
    }
    const worker = this.workers[this.nextWorkerIndex % this.workers.length];
    this.nextWorkerIndex += 1;
    if (worker === undefined) {
      throw new RuntimeError("worker pool selected a missing worker");
    }
    return worker;
  }

  private handleMessage(message: unknown): void {
    if (!isWorkerResponse(message)) {
      this.logger.warn("worker sent invalid message");
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      const result = message.result;
      if (result === undefined) {
        pending.reject(new RuntimeError("worker task succeeded without a result"));
        return;
      }
      pending.resolve(result);
      return;
    }
    pending.reject(new RuntimeError(message.error ?? "worker task failed"));
  }
}
