import { readdir, writeFile } from "node:fs/promises";
import net from "node:net";
import { PerformanceObserver, monitorEventLoopDelay } from "node:perf_hooks";
import type { AddressInfo } from "node:net";
import { parseConfig } from "../../src/config/schema.js";
import { Engine } from "../../src/core/engine.js";
import { Logger } from "../../src/logger/logger.js";
import { closeSocket } from "../../src/utils/net.js";

interface SoakOptions {
  readonly profile: string;
  readonly durationMs: number;
  readonly concurrency: number;
  readonly workerDelayMs: number;
  readonly reloadIntervalMs: number;
  readonly reportPath: string;
}

interface Sample {
  readonly atMs: number;
  readonly rss: number;
  readonly heapUsed: number;
  readonly activeSockets: number;
  readonly activeTimers: number;
  readonly activeListeners: number;
  readonly openFileDescriptors?: number;
}

interface SoakMetrics {
  success: number;
  errors: number;
  errorReasons: Map<string, number>;
  bytes: number;
  latencies: number[];
  samples: Sample[];
  reloadCount: number;
  finalSample?: Sample;
}

const options = parseArgs(process.argv.slice(2));
const logger = new Logger("silent");

const main = async (): Promise<void> => {
  const echo = await startEchoServer();
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
  await engine.start();

  const httpPort = getPort(engine.getInboundAddress("http-in"));
  const socksPort = getPort(engine.getInboundAddress("socks-in"));
  const eventLoop = monitorEventLoopDelay({ resolution: 20 });
  eventLoop.enable();

  const metrics: SoakMetrics = { success: 0, errors: 0, errorReasons: new Map(), bytes: 0, latencies: [], samples: [], reloadCount: 0 };
  const startedAt = Date.now();
  const gc = createGcPressureMonitor();
  const sampler = setInterval(() => {
    void (async () => {
      const memory = process.memoryUsage();
      const leaks = engine.getLeakSnapshot();
      metrics.samples.push({
        atMs: Date.now() - startedAt,
        rss: memory.rss,
        heapUsed: memory.heapUsed,
        activeSockets: leaks.activeSockets,
        activeTimers: leaks.activeTimers,
        activeListeners: leaks.activeListeners,
        ...(await openFileDescriptorCount())
      });
    })();
  }, 1_000);
  sampler.unref();

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
    void engine.reloadConfig(nextConfig).then(() => {
      metrics.reloadCount += 1;
    });
  }, options.reloadIntervalMs);
  hotReloadTimer.unref();

  const workers = Array.from({ length: options.concurrency }, async (_item, index) => {
    while (Date.now() < startedAt + options.durationMs) {
      const mode = index % 4;
      await runMeasured(metrics, async () => {
        if (mode === 0) {
          return await httpConnect(httpPort, echo.port, "http-soak");
        }
        if (mode === 1) {
          return await socksConnect(socksPort, echo.port, "socks-soak");
        }
        if (mode === 2) {
          return await httpBlocked(httpPort);
        }
        return await httpConnect(httpPort, echo.port, "reload-soak");
      });
      await sleep(options.workerDelayMs);
    }
  });

  await Promise.all(workers);
  clearInterval(sampler);
  clearInterval(hotReloadTimer);
  eventLoop.disable();
  await engine.stop();
  const finalMemory = process.memoryUsage();
  const finalLeaks = engine.getLeakSnapshot();
  metrics.finalSample = {
    atMs: Date.now() - startedAt,
    rss: finalMemory.rss,
    heapUsed: finalMemory.heapUsed,
    activeSockets: finalLeaks.activeSockets,
    activeTimers: finalLeaks.activeTimers,
    activeListeners: finalLeaks.activeListeners,
    ...(await openFileDescriptorCount())
  };
  await echo.close();
  gc.stop();

  const report = renderReport(
    options,
    metrics,
    eventLoop.percentile(50) / 1_000_000,
    eventLoop.percentile(95) / 1_000_000,
    eventLoop.percentile(99) / 1_000_000,
    gc.snapshot(),
    engine.getStats().outboundFailuresTotal
  );
  await writeFile(options.reportPath, report, "utf8");
  console.log(`soak completed: ${metrics.success} ok, ${metrics.errors} errors, report ${options.reportPath}`);
  if (metrics.errors > 0) {
    process.exitCode = 1;
  }
};

const runMeasured = async (metrics: SoakMetrics, task: () => Promise<number>): Promise<void> => {
  const startedAt = performance.now();
  try {
    const bytes = await withTimeout(task(), 3_000);
    metrics.success += 1;
    metrics.bytes += bytes;
  } catch (error) {
    metrics.errors += 1;
    const reason = error instanceof Error ? error.message : String(error);
    metrics.errorReasons.set(reason, (metrics.errorReasons.get(reason) ?? 0) + 1);
  } finally {
    metrics.latencies.push(performance.now() - startedAt);
  }
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
    server.once("listening", () => {
      resolve();
    });
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

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
};

interface GcPressureSnapshot {
  readonly count: number;
  readonly totalDurationMs: number;
  readonly maxDurationMs: number;
}

const renderReport = (
  soakOptions: SoakOptions,
  metrics: SoakMetrics,
  loopP50: number,
  loopP95: number,
  loopP99: number,
  gc: GcPressureSnapshot,
  failoverCount: number
): string => {
  const total = metrics.success + metrics.errors;
  const durationSec = soakOptions.durationMs / 1_000;
  const latest = metrics.samples.at(-1);
  const finalSample = metrics.finalSample;
  const rssValues = metrics.samples.map((sample) => sample.rss);
  const heapValues = metrics.samples.map((sample) => sample.heapUsed);
  const rssMin = rssValues.length === 0 ? 0 : Math.min(...rssValues);
  const rssMax = rssValues.length === 0 ? 0 : Math.max(...rssValues);
  const heapMin = heapValues.length === 0 ? 0 : Math.min(...heapValues);
  const heapMax = heapValues.length === 0 ? 0 : Math.max(...heapValues);
  return [
    "# Soak Report",
    "",
    `- profile: ${soakOptions.profile}`,
    `- durationMs: ${soakOptions.durationMs}`,
    `- concurrency: ${soakOptions.concurrency}`,
    `- workerDelayMs: ${soakOptions.workerDelayMs}`,
    `- reloadIntervalMs: ${soakOptions.reloadIntervalMs}`,
    `- totalRequests: ${total}`,
    `- success: ${metrics.success}`,
    `- errors: ${metrics.errors}`,
    `- errorReasons: ${JSON.stringify(Object.fromEntries(metrics.errorReasons.entries()))}`,
    `- successRate: ${total === 0 ? 0 : metrics.success / total}`,
    `- throughputMbps: ${((metrics.bytes * 8) / durationSec / 1_000_000).toFixed(2)}`,
    `- latencyP50Ms: ${percentile(metrics.latencies, 0.5).toFixed(2)}`,
    `- latencyP95Ms: ${percentile(metrics.latencies, 0.95).toFixed(2)}`,
    `- latencyP99Ms: ${percentile(metrics.latencies, 0.99).toFixed(2)}`,
    `- eventLoopP50Ms: ${loopP50.toFixed(2)}`,
    `- eventLoopP95Ms: ${loopP95.toFixed(2)}`,
    `- eventLoopP99Ms: ${loopP99.toFixed(2)}`,
    `- gcCount: ${gc.count}`,
    `- gcTotalDurationMs: ${gc.totalDurationMs.toFixed(2)}`,
    `- gcMaxDurationMs: ${gc.maxDurationMs.toFixed(2)}`,
    `- reloadCount: ${metrics.reloadCount}`,
    `- failoverCount: ${failoverCount}`,
    `- rssMinMiB: ${(rssMin / 1024 / 1024).toFixed(2)}`,
    `- rssMaxMiB: ${(rssMax / 1024 / 1024).toFixed(2)}`,
    `- heapMinMiB: ${(heapMin / 1024 / 1024).toFixed(2)}`,
    `- heapMaxMiB: ${(heapMax / 1024 / 1024).toFixed(2)}`,
    latest === undefined ? "- latestMemory: n/a" : `- latestRSSMiB: ${(latest.rss / 1024 / 1024).toFixed(2)}`,
    latest === undefined ? "- latestHeapMiB: n/a" : `- latestHeapMiB: ${(latest.heapUsed / 1024 / 1024).toFixed(2)}`,
    latest === undefined ? "- activeResources: n/a" : `- activeResources: sockets=${latest.activeSockets} timers=${latest.activeTimers} listeners=${latest.activeListeners}`,
    latest?.openFileDescriptors === undefined ? "- openFileDescriptors: n/a" : `- openFileDescriptors: ${latest.openFileDescriptors}`,
    finalSample === undefined ? "- finalAfterStop: n/a" : `- finalAfterStop: sockets=${finalSample.activeSockets} timers=${finalSample.activeTimers} listeners=${finalSample.activeListeners}`,
    finalSample?.openFileDescriptors === undefined ? "- finalOpenFileDescriptors: n/a" : `- finalOpenFileDescriptors: ${finalSample.openFileDescriptors}`,
    "",
    "## Samples",
    "",
    "```json",
    JSON.stringify(metrics.samples, null, 2),
    "```",
    ""
  ].join("\n");
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

const openFileDescriptorCount = async (): Promise<{ readonly openFileDescriptors?: number }> => {
  try {
    const entries = await readdir("/dev/fd");
    return { openFileDescriptors: entries.length };
  } catch {
    return {};
  }
};

function parseArgs(args: readonly string[]): SoakOptions {
  const value = (name: string, fallback: string): string => {
    const index = args.indexOf(name);
    return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
  };
  const profile = value("--profile", "short");
  return {
    profile,
    durationMs: Number(value("--duration-ms", process.env.SEPIGS_SOAK_DURATION ?? process.env.SOAK_DURATION_MS ?? defaultDurationMs(profile))),
    concurrency: Number(value("--concurrency", process.env.SEPIGS_SOAK_CONCURRENCY ?? process.env.SOAK_CONCURRENCY ?? defaultConcurrency(profile))),
    workerDelayMs: Number(value("--worker-delay-ms", process.env.SOAK_WORKER_DELAY_MS ?? defaultWorkerDelayMs(profile))),
    reloadIntervalMs: Number(value("--reload-interval-ms", process.env.SEPIGS_SOAK_RELOAD_INTERVAL ?? "5000")),
    reportPath: value("--report", reportPathForProfile(profile))
  };
}

function defaultDurationMs(profile: string): string {
  if (profile === "1h") {
    return "3600000";
  }
  if (profile === "6h") {
    return "21600000";
  }
  return "600000";
}

function defaultConcurrency(profile: string): string {
  if (profile === "1h") {
    return "64";
  }
  if (profile === "6h") {
    return "128";
  }
  return "16";
}

function defaultWorkerDelayMs(profile: string): string {
  if (profile === "6h") {
    return "750";
  }
  return "500";
}

function reportPathForProfile(profile: string): string {
  if (profile === "1h") {
    return "docs/soak-1h-report.md";
  }
  if (profile === "6h") {
    return "docs/soak-6h-report.md";
  }
  return "docs/soak-report.md";
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
