import { readdir, writeFile } from "node:fs/promises";
import net, { type AddressInfo } from "node:net";
import { PerformanceObserver, monitorEventLoopDelay } from "node:perf_hooks";
import { parseConfig } from "../config/schema.js";
import { Engine } from "../core/engine.js";
import { Logger } from "../logger/logger.js";
import { closeSocket } from "../utils/net.js";
import {
  appendSoakJsonl,
  createSoakRunPaths,
  ensureSoakRunDir,
  loadSoakCheckpoint,
  writeSoakCheckpoint,
  type SoakCheckpoint,
  type SoakRunPaths
} from "./checkpoint.js";
import { writeSoakFinalReport, writeSoakSummary, type SoakReportInput, type SoakResourceSample } from "./reporter.js";

export interface FullSoakOptions {
  readonly profile: string;
  readonly durationMs: number;
  readonly concurrency: number;
  readonly workerDelayMs: number;
  readonly reloadIntervalMs: number;
  readonly sampleIntervalMs: number;
  readonly summaryIntervalMs: number;
  readonly runDir: string;
  readonly docsReportPath?: string;
  readonly resume: boolean;
}

interface MutableSoakState {
  success: number;
  errors: number;
  bytes: number;
  reloadCount: number;
  latencies: number[];
  errorReasons: Map<string, number>;
}

export interface ActiveSoakClock {
  elapsedMs(): number;
  pauseCount(): number;
  suspendedMs(): number;
  isRecoveringFromPause(): boolean;
  stop(): void;
}

export interface ActiveSoakClockOptions {
  readonly tickMs?: number;
  readonly pauseThresholdMs?: number;
  readonly recoveryWindowMs?: number;
}

interface GcPressureSnapshot {
  readonly count: number;
  readonly totalDurationMs: number;
  readonly maxDurationMs: number;
}

export interface FullSoakResult {
  readonly checkpoint: SoakCheckpoint;
  readonly paths: SoakRunPaths;
  readonly finalSample: SoakResourceSample;
  readonly errors: number;
  readonly interrupted: boolean;
}

export const runFullSoak = async (options: FullSoakOptions): Promise<FullSoakResult> => {
  const paths = createSoakRunPaths(options.runDir);
  await ensureSoakRunDir(paths);

  const previous = options.resume ? await loadSoakCheckpoint(paths) : undefined;
  if (previous !== undefined && isSoakCheckpointCompleteFor(previous, options.durationMs)) {
    const finalSample = await sampleProcess(0, undefined);
    return {
      checkpoint: previous,
      paths,
      finalSample,
      errors: previous.errors,
      interrupted: false
    };
  }

  const echo = await startEchoServer();
  const logger = new Logger("silent");
  const config = parseConfig({
    log: { level: "silent" },
    limits: { connectTimeoutMs: 500, handshakeTimeoutMs: 500, idleTimeoutMs: 1_000, shutdownTimeoutMs: 2_000 },
    inbounds: [
      { type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 },
      { type: "socks5", tag: "socks-in", listen: "127.0.0.1", port: 0 }
    ],
    outbounds: [
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" }
    ],
    route: { defaultOutbound: "direct", rules: [] }
  });
  const engine = new Engine(config, logger);
  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  const gc = createGcPressureMonitor();
  const signalState = { interrupted: false };
  let activeClock: ActiveSoakClock | undefined;

  const onSignal = (): void => {
    signalState.interrupted = true;
  };
  process.once("SIGINT", onSignal);

  try {
    await engine.start();
    eventLoop.enable();
    const httpPort = getPort(engine.getInboundAddress("http-in"));
    const socksPort = getPort(engine.getInboundAddress("socks-in"));
    const state = createState(previous);
    const baseElapsedMs = previous?.elapsedMs ?? 0;
    const startedAt = previous?.startedAt ?? Date.now();
    const clock = createActiveSoakClock(baseElapsedMs, previous?.infrastructurePauses ?? 0, previous?.suspendedMs ?? 0);
    activeClock = clock;

    const createCheckpoint = (completed: boolean): SoakCheckpoint => {
      return {
        profile: options.profile,
        durationMs: options.durationMs,
        concurrency: options.concurrency,
        startedAt,
        elapsedMs: Math.min(options.durationMs, clock.elapsedMs()),
        success: state.success,
        errors: state.errors,
        bytes: state.bytes,
        reloadCount: state.reloadCount,
        infrastructurePauses: clock.pauseCount(),
        suspendedMs: clock.suspendedMs(),
        latencies: trimLatencies(state.latencies),
        errorReasons: Object.fromEntries(state.errorReasons.entries()),
        completed,
        updatedAt: Date.now()
      };
    };

    let latestSample = await sampleProcess(0, engine);
    let lastSampleAt = 0;
    let lastSummaryAt = 0;

    const writeCheckpointAndMetrics = async (completed: boolean): Promise<SoakCheckpoint> => {
      const checkpoint = createCheckpoint(completed);
      latestSample = await sampleProcess(checkpoint.elapsedMs, engine);
      await writeSoakCheckpoint(paths, checkpoint);
      await appendSoakJsonl(paths.metricsJsonl, {
        ...latestSample,
        timestamp: new Date().toISOString(),
        success: checkpoint.success,
        errors: checkpoint.errors,
        bytes: checkpoint.bytes,
        reloadCount: checkpoint.reloadCount,
        eventLoopP95Ms: eventLoop.percentile(95) / 1_000_000,
        gc: gc.snapshot(),
        activeConnections: engine.getActiveConnections().length,
        stats: engine.getStats()
      });
      return checkpoint;
    };

    const maybeWritePeriodicFiles = async (): Promise<void> => {
      const elapsedMs = clock.elapsedMs();
      if (elapsedMs - lastSampleAt >= options.sampleIntervalMs) {
        lastSampleAt = elapsedMs;
        const checkpoint = await writeCheckpointAndMetrics(false);
        if (elapsedMs - lastSummaryAt >= options.summaryIntervalMs) {
          lastSummaryAt = elapsedMs;
          await writeSoakSummary(
            paths,
            reportInput(checkpoint, latestSample, undefined, eventLoop.percentile(95) / 1_000_000, gc.snapshot(), engine, signalState.interrupted)
          );
        }
      }
    };

    let hotReloadToggle = false;
    const hotReloadTimer = setInterval(() => {
      hotReloadToggle = !hotReloadToggle;
      const nextConfig = parseConfig({
        ...config,
        route: {
          defaultOutbound: "direct",
          rules: hotReloadToggle ? [{ tag: "block-admin", port: [1], outboundTag: "block" }] : []
        }
      });
      void engine.reloadConfig(nextConfig).then(
        () => {
          state.reloadCount += 1;
        },
        (error: unknown) => {
          recordError(state, error);
          void appendSoakJsonl(paths.failuresJsonl, failureRecord("hot-reload", error));
        }
      );
    }, options.reloadIntervalMs);
    hotReloadTimer.unref();

    const workers = Array.from({ length: options.concurrency }, async (_item, index) => {
      while (!signalState.interrupted && clock.elapsedMs() < options.durationMs) {
        const mode = index % 4;
        await runMeasured(state, paths, clock, modeName(mode), async () => {
          if (mode === 0) {
            return await httpConnect(httpPort, echo.port, "http-full-soak");
          }
          if (mode === 1) {
            return await socksConnect(socksPort, echo.port, "socks-full-soak");
          }
          if (mode === 2) {
            return await httpBlocked(httpPort);
          }
          return await httpConnect(httpPort, echo.port, "reload-full-soak");
        });
        await maybeWritePeriodicFiles();
        await sleep(options.workerDelayMs);
      }
    });

    await Promise.all(workers);
    clearInterval(hotReloadTimer);
    const completed = !signalState.interrupted && clock.elapsedMs() >= options.durationMs;
    const checkpoint = await writeCheckpointAndMetrics(completed);
    clock.stop();
    eventLoop.disable();
    const activeConnections = engine.getActiveConnections();
    await writeFile(paths.connectionsJson, `${JSON.stringify(activeConnections, null, 2)}\n`, "utf8");
    await engine.stop();
    const finalSample = await sampleProcess(checkpoint.elapsedMs, engine);
    const gcSnapshot = gc.snapshot();
    await writeSoakFinalReport(
      paths,
      reportInput(checkpoint, latestSample, finalSample, eventLoop.percentile(95) / 1_000_000, gcSnapshot, engine, signalState.interrupted),
      options.docsReportPath
    );
    return { checkpoint, paths, finalSample, errors: checkpoint.errors, interrupted: signalState.interrupted };
  } finally {
    process.removeListener("SIGINT", onSignal);
    activeClock?.stop();
    gc.stop();
    eventLoop.disable();
    await engine.stop();
    await echo.close();
  }
};

export const isSoakCheckpointCompleteFor = (checkpoint: SoakCheckpoint, requestedDurationMs: number): boolean => {
  return checkpoint.completed && checkpoint.elapsedMs >= requestedDurationMs;
};

const createState = (previous: SoakCheckpoint | undefined): MutableSoakState => {
  return {
    success: previous?.success ?? 0,
    errors: previous?.errors ?? 0,
    bytes: previous?.bytes ?? 0,
    reloadCount: previous?.reloadCount ?? 0,
    latencies: [...(previous?.latencies ?? [])],
    errorReasons: new Map(Object.entries(previous?.errorReasons ?? {}))
  };
};

const reportInput = (
  checkpoint: SoakCheckpoint,
  latestSample: SoakResourceSample | undefined,
  finalSample: SoakResourceSample | undefined,
  eventLoopP95Ms: number,
  gcSnapshot: GcPressureSnapshot,
  engine: Engine,
  interrupted: boolean
): SoakReportInput => {
  return {
    checkpoint,
    eventLoopP95Ms,
    gcCount: gcSnapshot.count,
    gcTotalDurationMs: gcSnapshot.totalDurationMs,
    failoverCount: engine.getStats().outboundFailuresTotal,
    interrupted,
    ...(latestSample === undefined ? {} : { latestSample }),
    ...(finalSample === undefined ? {} : { finalSample })
  };
};

const runMeasured = async (
  state: MutableSoakState,
  paths: SoakRunPaths,
  clock: ActiveSoakClock,
  scenario: string,
  task: () => Promise<number>
): Promise<void> => {
  const startedAt = performance.now();
  try {
    const bytes = await withTimeout(task(), 3_000);
    state.success += 1;
    state.bytes += bytes;
  } catch (error) {
    const infrastructurePause = clock.isRecoveringFromPause();
    if (!infrastructurePause) {
      state.errors += 1;
      recordError(state, error);
    }
    await appendSoakJsonl(paths.failuresJsonl, failureRecord(scenario, error, infrastructurePause ? "host-pause" : "runtime"));
  } finally {
    state.latencies.push(performance.now() - startedAt);
  }
};

const recordError = (state: MutableSoakState, error: unknown): void => {
  const reason = error instanceof Error ? error.message : String(error);
  state.errorReasons.set(reason, (state.errorReasons.get(reason) ?? 0) + 1);
};

const failureRecord = (scenario: string, error: unknown, category = "runtime"): Record<string, unknown> => {
  return {
    timestamp: new Date().toISOString(),
    scenario,
    category,
    reason: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  };
};

export const createActiveSoakClock = (
  baseElapsedMs: number,
  basePauseCount: number,
  baseSuspendedMs: number,
  options: ActiveSoakClockOptions = {}
): ActiveSoakClock => {
  const tickMs = options.tickMs ?? 1_000;
  const pauseThresholdMs = options.pauseThresholdMs ?? 10_000;
  const recoveryWindowMs = options.recoveryWindowMs ?? 5_000;
  let activeElapsedMs = baseElapsedMs;
  let pauses = basePauseCount;
  let suspended = baseSuspendedMs;
  let lastTickAt = Date.now();
  let lastPauseAt = 0;

  const timer = setInterval(() => {
    const now = Date.now();
    const delta = now - lastTickAt;
    lastTickAt = now;
    if (delta > pauseThresholdMs) {
      pauses += 1;
      suspended += Math.max(0, delta - tickMs);
      activeElapsedMs += tickMs;
      lastPauseAt = now;
      return;
    }
    activeElapsedMs += delta;
  }, tickMs);
  timer.unref();

  return {
    elapsedMs: () => activeElapsedMs + Math.min(Date.now() - lastTickAt, tickMs * 2),
    pauseCount: () => pauses,
    suspendedMs: () => suspended,
    isRecoveringFromPause: () => Date.now() - lastTickAt > pauseThresholdMs || Date.now() - lastPauseAt < recoveryWindowMs,
    stop: () => {
      clearInterval(timer);
    }
  };
};

const modeName = (mode: number): string => {
  if (mode === 0) {
    return "http-connect";
  }
  if (mode === 1) {
    return "socks5-connect";
  }
  if (mode === 2) {
    return "blocked-connect";
  }
  return "hot-reload-connect";
};

const httpConnect = async (proxyPort: number, targetPort: number, payload: string): Promise<number> => {
  const socket = await connect(proxyPort);
  try {
    socket.write(`CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n\r\n`);
    await readUntil(socket, (buffer) => buffer.includes("200 Connection Established"));
    socket.write(payload);
    const response = await readUntil(socket, (buffer) => buffer.includes(payload));
    return response.byteLength;
  } finally {
    closeSocket(socket);
  }
};

const httpBlocked = async (proxyPort: number): Promise<number> => {
  const socket = await connect(proxyPort);
  try {
    socket.write("CONNECT 127.0.0.1:1 HTTP/1.1\r\nHost: 127.0.0.1:1\r\n\r\n");
    const response = await readUntil(socket, (buffer) => buffer.includes("\r\n\r\n"));
    return response.byteLength;
  } finally {
    closeSocket(socket);
  }
};

const socksConnect = async (proxyPort: number, targetPort: number, payload: string): Promise<number> => {
  const socket = await connect(proxyPort);
  try {
    socket.write(Buffer.from([0x05, 0x01, 0x00]));
    await readBytes(socket, 2);
    const host = Buffer.from([127, 0, 0, 1]);
    const request = Buffer.concat([Buffer.from([0x05, 0x01, 0x00, 0x01]), host, Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff])]);
    socket.write(request);
    await readBytes(socket, 10);
    socket.write(payload);
    const response = await readUntil(socket, (buffer) => buffer.includes(payload));
    return response.byteLength;
  } finally {
    closeSocket(socket);
  }
};

const connect = async (port: number): Promise<net.Socket> => {
  return await new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    const timer = setTimeout(() => {
      cleanup();
      closeSocket(socket);
      reject(new Error("connect timeout"));
    }, 1_000);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("connect", onConnect);
      socket.removeListener("error", onError);
    };
    const onConnect = (): void => {
      cleanup();
      resolve(socket);
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    socket.once("connect", onConnect);
    socket.once("error", onError);
  });
};

const readBytes = async (socket: net.Socket, length: number): Promise<Buffer> => {
  return await readUntil(socket, (buffer) => buffer.byteLength >= length);
};

const readUntil = async (socket: net.Socket, predicate: (buffer: Buffer) => boolean): Promise<Buffer> => {
  return await new Promise<Buffer>((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("read timeout"));
    }, 2_000);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk]);
      if (predicate(buffer)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error("socket closed"));
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
};

const startEchoServer = async (): Promise<{ readonly port: number; close(): Promise<void> }> => {
  const server = net.createServer((socket) => {
    socket.on("error", () => undefined);
    socket.pipe(socket);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
    server.listen(0, "127.0.0.1");
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("echo server failed to bind");
  }
  return {
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  };
};

const getPort = (address: AddressInfo | string | null): number => {
  if (typeof address === "object" && address !== null) {
    return address.port;
  }
  throw new Error("expected TCP address");
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`operation timeout after ${timeoutMs}ms`));
        }, timeoutMs);
        timer.unref();
      })
    ]);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
  }
};

const sleep = async (timeoutMs: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
};

const createGcPressureMonitor = (): { stop(): void; snapshot(): GcPressureSnapshot } => {
  let count = 0;
  let totalDurationMs = 0;
  let maxDurationMs = 0;
  const observer = new PerformanceObserver((items) => {
    for (const entry of items.getEntries()) {
      count += 1;
      totalDurationMs += entry.duration;
      maxDurationMs = Math.max(maxDurationMs, entry.duration);
    }
  });
  observer.observe({ entryTypes: ["gc"] });
  return {
    stop: () => {
      observer.disconnect();
    },
    snapshot: () => ({ count, totalDurationMs, maxDurationMs })
  };
};

const sampleProcess = async (atMs: number, engine: Engine | undefined): Promise<SoakResourceSample> => {
  const memory = process.memoryUsage();
  const leaks = engine?.getLeakSnapshot();
  return {
    atMs,
    rss: memory.rss,
    heapUsed: memory.heapUsed,
    activeSockets: leaks?.activeSockets ?? 0,
    activeTimers: leaks?.activeTimers ?? 0,
    activeListeners: leaks?.activeListeners ?? 0,
    ...(await openFileDescriptorCount())
  };
};

const openFileDescriptorCount = async (): Promise<{ readonly openFileDescriptors?: number }> => {
  try {
    const entries = await readdir("/dev/fd");
    return { openFileDescriptors: entries.length };
  } catch {
    return {};
  }
};

const trimLatencies = (latencies: readonly number[]): readonly number[] => {
  const maxStored = 100_000;
  return latencies.length <= maxStored ? latencies : latencies.slice(latencies.length - maxStored);
};
