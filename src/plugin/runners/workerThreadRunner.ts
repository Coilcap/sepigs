import { Worker } from "node:worker_threads";
import type { Readable } from "node:stream";
import type { PluginIsolationConfig, PluginModuleConfig } from "../../config/types.js";
import { ConfigError, TimeoutError } from "../../utils/errors.js";
import type { PluginManifest } from "../manifest.js";
import type { PluginRunner, PluginRunnerEvents } from "../types.js";

interface PendingCall {
  readonly timer: NodeJS.Timeout;
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

interface HostResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly payload?: unknown;
}

interface HostEvent {
  readonly event: "registerOutboundFactory";
  readonly type: string;
}

const isHostResponse = (value: unknown): value is HostResponse => {
  return typeof value === "object" && value !== null && "id" in value && "ok" in value;
};

const isHostEvent = (value: unknown): value is HostEvent => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return record.event === "registerOutboundFactory" && typeof record.type === "string";
};

export class WorkerThreadPluginRunner implements PluginRunner {
  public readonly tag: string;
  private readonly config: PluginModuleConfig;
  private readonly manifest: PluginManifest;
  private readonly isolation: PluginIsolationConfig;
  private readonly events: PluginRunnerEvents;
  private readonly pending = new Map<number, PendingCall>();
  private worker: Worker | undefined;
  private nextId = 1;
  private outputBytes = 0;

  public constructor(config: PluginModuleConfig, manifest: PluginManifest, isolation: PluginIsolationConfig, events: PluginRunnerEvents = {}) {
    this.tag = config.tag;
    this.config = config;
    this.manifest = manifest;
    this.isolation = isolation;
    this.events = events;
  }

  public async setup(): Promise<void> {
    this.ensureWorker();
    await this.call("setup");
  }

  public async start(): Promise<void> {
    await this.call("start");
  }

  public async stop(): Promise<void> {
    if (this.worker === undefined) {
      return;
    }
    try {
      await this.call("stop");
    } finally {
      await this.worker.terminate();
      this.worker = undefined;
      this.events.onRunnerClosed?.(this);
    }
  }

  public async invoke(payload: unknown): Promise<unknown> {
    return await this.call("invoke", payload);
  }

  private ensureWorker(): Worker {
    if (this.worker !== undefined) {
      return this.worker;
    }
    const worker = new Worker(new URL("./workerThreadHost.js", import.meta.url), {
      workerData: {
        tag: this.config.tag,
        entryPath: this.manifest.entryPath,
        name: this.manifest.name,
        permissions: this.manifest.permissions
      },
      resourceLimits: {
        maxOldGenerationSizeMb: this.isolation.memoryLimitMb
      },
      stdout: true,
      stderr: true
    });
    this.attachOutput(worker.stdout);
    this.attachOutput(worker.stderr);
    worker.on("message", (message: unknown) => {
      this.onMessage(message);
    });
    worker.once("error", (error) => {
      this.rejectAll(error);
    });
    worker.once("exit", (code) => {
      if (this.worker === worker) {
        this.worker = undefined;
      }
      this.events.onRunnerClosed?.(this);
      if (code !== 0) {
        this.rejectAll(new ConfigError(`worker-thread plugin "${this.config.tag}" exited with code ${code}`));
      }
    });
    this.worker = worker;
    return worker;
  }

  private async call(method: "setup" | "start" | "stop" | "invoke", payload?: unknown): Promise<unknown> {
    const worker = this.ensureWorker();
    const id = this.nextId;
    this.nextId += 1;
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        void worker.terminate();
        this.worker = undefined;
        reject(new TimeoutError(`plugin "${this.config.tag}" ${method} timed out after ${this.isolation.timeoutMs}ms`));
      }, this.isolation.timeoutMs);
      timer.unref();
      this.pending.set(id, { timer, resolve, reject });
      worker.postMessage({ id, method, payload });
    });
  }

  private onMessage(message: unknown): void {
    if (isHostEvent(message)) {
      this.events.onRegisterOutboundFactory?.(message.type, this);
      return;
    }
    if (!isHostResponse(message)) {
      return;
    }
    const pending = this.pending.get(message.id);
    if (pending === undefined) {
      return;
    }
    this.pending.delete(message.id);
    clearTimeout(pending.timer);
    if (message.ok) {
      pending.resolve(message.payload);
      return;
    }
    pending.reject(new ConfigError(typeof message.payload === "string" ? message.payload : `plugin "${this.config.tag}" failed`));
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timer);
      pending.reject(error);
    }
  }

  private attachOutput(stream: Readable | null): void {
    if (stream === null) {
      return;
    }
    stream.on("data", (chunk: Buffer) => {
      this.outputBytes += chunk.byteLength;
      if (this.outputBytes > this.isolation.stdoutLimitBytes && this.worker !== undefined) {
        void this.worker.terminate();
        this.worker = undefined;
        this.rejectAll(new ConfigError(`plugin "${this.config.tag}" exceeded stdout/stderr limit`));
      }
    });
  }
}
