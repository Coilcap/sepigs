import { spawn } from "node:child_process";
import type { ChildProcessByStdio } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import type { Readable } from "node:stream";
import { redactCompatText } from "./secrets.js";
import { waitForTcpPortClosed } from "./ports.js";

export interface ExternalProcessSpec {
  readonly name: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly artifactDirectory: string;
  readonly cwd?: string;
  readonly env?: Readonly<Record<string, string>>;
  readonly startupTimeoutMs: number;
  readonly stopTimeoutMs: number;
  readonly readinessIntervalMs?: number;
  readonly maxLogBytes: number;
  readonly cleanupPorts?: readonly number[];
  readonly readiness?: () => Promise<boolean>;
}

export type ExternalProcessStartupStatus = "ready" | "failed" | "timeout";

export interface ExternalProcessSnapshot {
  readonly pid?: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly stdoutTruncated: boolean;
  readonly stderrTruncated: boolean;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
}

export interface ExternalProcessStopResult extends ExternalProcessSnapshot {
  readonly graceful: boolean;
  readonly forced: boolean;
  readonly portsReleased: boolean;
  readonly artifactDirectory: string;
}

export interface ExternalProcessStartResult {
  readonly status: ExternalProcessStartupStatus;
  readonly reason: string;
  readonly process: ManagedExternalProcess;
}

type ManagedChild = ChildProcessByStdio<null, Readable, Readable>;

export class ManagedExternalProcess {
  private stopPromise: Promise<ExternalProcessStopResult> | undefined;

  public constructor(
    private readonly child: ManagedChild,
    private readonly spec: ExternalProcessSpec,
    private readonly stdout: BoundedOutput,
    private readonly stderr: BoundedOutput
  ) {}

  public snapshot(): ExternalProcessSnapshot {
    return {
      ...(this.child.pid === undefined ? {} : { pid: this.child.pid }),
      stdout: redactCompatText(this.stdout.text()),
      stderr: redactCompatText(this.stderr.text()),
      stdoutTruncated: this.stdout.truncated,
      stderrTruncated: this.stderr.truncated,
      exitCode: this.child.exitCode,
      signal: this.child.signalCode
    };
  }

  public async stop(): Promise<ExternalProcessStopResult> {
    this.stopPromise ??= this.stopInternal();
    return await this.stopPromise;
  }

  private async stopInternal(): Promise<ExternalProcessStopResult> {
    let graceful = this.child.pid === undefined || this.child.exitCode !== null || this.child.signalCode !== null;
    let forced = false;
    if (!graceful) {
      signalProcessTree(this.child, "SIGTERM");
      graceful = await waitForExit(this.child, this.spec.stopTimeoutMs);
    }
    if (!graceful) {
      forced = true;
      signalProcessTree(this.child, "SIGKILL");
      await waitForExit(this.child, this.spec.stopTimeoutMs);
    }
    const portsReleased = await checkPortsReleased(this.spec.cleanupPorts ?? [], this.spec.stopTimeoutMs);
    const snapshot = this.snapshot();
    const result: ExternalProcessStopResult = {
      ...snapshot,
      graceful,
      forced,
      portsReleased,
      artifactDirectory: this.spec.artifactDirectory
    };
    await writeArtifacts(this.spec, result);
    return result;
  }
}

export const startExternalProcess = async (spec: ExternalProcessSpec): Promise<ExternalProcessStartResult> => {
  await mkdir(spec.artifactDirectory, { recursive: true, mode: 0o700 });
  const stdout = new BoundedOutput(spec.maxLogBytes);
  const stderr = new BoundedOutput(spec.maxLogBytes);
  const child = spawn(spec.command, [...spec.args], {
    cwd: spec.cwd,
    env: { ...process.env, ...spec.env },
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"]
  });
  let resolveSpawn: (result: { readonly ok: boolean; readonly error?: string }) => void;
  const spawnOutcome = new Promise<{ readonly ok: boolean; readonly error?: string }>((resolve) => {
    resolveSpawn = resolve;
  });
  child.once("spawn", () => {
    resolveSpawn({ ok: true });
  });
  child.stdout.on("data", (chunk: Buffer | string) => {
    stdout.append(chunk);
  });
  child.stderr.on("data", (chunk: Buffer | string) => {
    stderr.append(chunk);
  });
  child.on("error", (error) => {
    resolveSpawn({ ok: false, error: error.message });
    stderr.append(`\nspawn error: ${error.message}\n`);
  });

  const managed = new ManagedExternalProcess(child, spec, stdout, stderr);
  const spawned = await spawnOutcome;
  if (!spawned.ok) {
    await managed.stop();
    return {
      status: "failed",
      reason: `external process failed to spawn: ${spawned.error ?? "unknown spawn error"}`,
      process: managed
    };
  }
  const deadline = Date.now() + spec.startupTimeoutMs;
  let lastReadinessError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      await managed.stop();
      return {
        status: "failed",
        reason: `external process exited before readiness with code ${String(child.exitCode)} signal ${String(child.signalCode)}`,
        process: managed
      };
    }
    try {
      if (spec.readiness === undefined || await spec.readiness()) {
        return { status: "ready", reason: "readiness probe passed", process: managed };
      }
    } catch (error) {
      lastReadinessError = error instanceof Error ? error.message : String(error);
    }
    await delay(spec.readinessIntervalMs ?? 50);
  }
  await managed.stop();
  return {
    status: "timeout",
    reason: `startup timeout after ${spec.startupTimeoutMs}ms${lastReadinessError.length === 0 ? "" : `; last probe error: ${lastReadinessError}`}`,
    process: managed
  };
};

class BoundedOutput {
  private readonly chunks: Buffer[] = [];
  private bytes = 0;
  public truncated = false;

  public constructor(private readonly maxBytes: number) {}

  public append(value: Buffer | string): void {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    const remaining = Math.max(0, this.maxBytes - this.bytes);
    if (remaining > 0) {
      const accepted = chunk.subarray(0, remaining);
      this.chunks.push(accepted);
      this.bytes += accepted.byteLength;
    }
    if (chunk.byteLength > remaining) {
      this.truncated = true;
    }
  }

  public text(): string {
    return Buffer.concat(this.chunks, this.bytes).toString("utf8");
  }
}

const signalProcessTree = (child: ManagedChild, signal: NodeJS.Signals): void => {
  if (child.pid === undefined) return;
  try {
    if (process.platform === "win32") {
      child.kill(signal);
    } else {
      process.kill(-child.pid, signal);
    }
  } catch {
    try {
      child.kill(signal);
    } catch {
      // The process already exited.
    }
  }
};

const waitForExit = async (child: ManagedChild, timeoutMs: number): Promise<boolean> => {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return await new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (exited: boolean): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.removeListener("exit", onExit);
      resolve(exited);
    };
    const onExit = (): void => {
      finish(true);
    };
    const timer = setTimeout(() => {
      finish(false);
    }, timeoutMs);
    child.once("exit", onExit);
  });
};

const checkPortsReleased = async (ports: readonly number[], timeoutMs: number): Promise<boolean> => {
  for (const port of ports) {
    if (!(await waitForTcpPortClosed(port, { timeoutMs }))) return false;
  }
  return true;
};

const writeArtifacts = async (spec: ExternalProcessSpec, result: ExternalProcessStopResult): Promise<void> => {
  const metadata = {
    name: spec.name,
    command: basename(spec.command),
    args: spec.args.map((arg) => redactCompatText(arg)),
    exitCode: result.exitCode,
    signal: result.signal,
    graceful: result.graceful,
    forced: result.forced,
    portsReleased: result.portsReleased,
    stdoutTruncated: result.stdoutTruncated,
    stderrTruncated: result.stderrTruncated
  };
  await Promise.all([
    writeFile(`${spec.artifactDirectory}/stdout.log`, result.stdout, { encoding: "utf8", mode: 0o600 }),
    writeFile(`${spec.artifactDirectory}/stderr.log`, result.stderr, { encoding: "utf8", mode: 0o600 }),
    writeFile(`${spec.artifactDirectory}/process.json`, `${JSON.stringify(metadata, null, 2)}\n`, { encoding: "utf8", mode: 0o600 })
  ]);
};

const delay = async (timeoutMs: number): Promise<void> => {
  await new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
};
