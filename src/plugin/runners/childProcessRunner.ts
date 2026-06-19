import { spawn, type ChildProcess } from "node:child_process";
import type { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
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

export class ChildProcessPluginRunner implements PluginRunner {
  public readonly tag: string;
  private readonly config: PluginModuleConfig;
  private readonly manifest: PluginManifest;
  private readonly isolation: PluginIsolationConfig;
  private readonly events: PluginRunnerEvents;
  private readonly pending = new Map<number, PendingCall>();
  private child: ChildProcess | undefined;
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
    this.ensureChild();
    await this.call("setup");
  }

  public async start(): Promise<void> {
    await this.call("start");
  }

  public async stop(): Promise<void> {
    const child = this.child;
    if (child === undefined) {
      return;
    }
    try {
      await this.call("stop");
    } finally {
      child.kill();
      this.child = undefined;
      this.events.onRunnerClosed?.(this);
    }
  }

  public async invoke(payload: unknown): Promise<unknown> {
    return await this.call("invoke", payload);
  }

  private ensureChild(): ChildProcess {
    if (this.child !== undefined) {
      return this.child;
    }

    const hostPath = fileURLToPath(new URL("./childProcessHost.js", import.meta.url));
    const child = spawn(process.execPath, [`--max-old-space-size=${this.isolation.memoryLimitMb}`, hostPath], {
      stdio: ["ignore", "pipe", "pipe", "ipc"],
      env: {
        ...process.env,
        SEPIGS_PLUGIN_RUNNER_CONFIG: JSON.stringify({
          tag: this.config.tag,
          entryPath: this.manifest.entryPath,
          name: this.manifest.name,
          permissions: this.manifest.permissions
        })
      }
    });
    this.attachOutput(child.stdout);
    this.attachOutput(child.stderr);
    child.on("message", (message: unknown) => {
      this.onMessage(message);
    });
    child.once("error", (error) => {
      this.rejectAll(error);
    });
    child.once("exit", (code, signal) => {
      const expectedStop = this.child === undefined;
      if (this.child === child) {
        this.child = undefined;
      }
      this.events.onRunnerClosed?.(this);
      if (!expectedStop && code !== 0) {
        this.rejectAll(new ConfigError(`child-process plugin "${this.config.tag}" exited with code ${code ?? "n/a"} signal ${signal ?? "n/a"}`));
      }
    });
    this.child = child;
    return child;
  }

  private async call(method: "setup" | "start" | "stop" | "invoke", payload?: unknown): Promise<unknown> {
    const child = this.ensureChild();
    const id = this.nextId;
    this.nextId += 1;
    return await new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        child.kill();
        this.child = undefined;
        reject(new TimeoutError(`plugin "${this.config.tag}" ${method} timed out after ${this.isolation.timeoutMs}ms`));
      }, this.isolation.timeoutMs);
      timer.unref();
      this.pending.set(id, { timer, resolve, reject });
      child.send({ id, method, payload });
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
      if (this.outputBytes > this.isolation.stdoutLimitBytes && this.child !== undefined) {
        this.child.kill();
        this.child = undefined;
        this.rejectAll(new ConfigError(`plugin "${this.config.tag}" exceeded stdout/stderr limit`));
      }
    });
  }
}
