#!/usr/bin/env tsx
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { closeSocket, connectTcp, writeSocket } from "../src/utils/net.js";
import { Logger } from "../src/logger/logger.js";

interface BenchmarkOptions {
  readonly levels: readonly number[];
  readonly maxActive: number;
  readonly payloadBytes: number;
  readonly timeoutMs: number;
}

interface ScenarioResult {
  readonly targetConcurrency: number;
  readonly effectiveConcurrency: number;
  readonly totalConnections: number;
  readonly successes: number;
  readonly failures: number;
  readonly bytes: number;
  readonly durationMs: number;
  readonly throughputMbps: number;
  readonly latencyP50Ms: number;
  readonly latencyP95Ms: number;
  readonly latencyP99Ms: number;
  readonly cpuUserMs: number;
  readonly cpuSystemMs: number;
  readonly rssBeforeBytes: number;
  readonly rssAfterBytes: number;
  readonly heapUsedBeforeBytes: number;
  readonly heapUsedAfterBytes: number;
}

interface BenchmarkReport {
  readonly generatedAt: string;
  readonly options: BenchmarkOptions;
  readonly scenarios: readonly ScenarioResult[];
  readonly engineStats: ReturnType<Engine["getStats"]>;
  readonly leakSnapshot: ReturnType<Engine["getLeakSnapshot"]>;
  readonly resourceSnapshot: ReturnType<Engine["getResourceSnapshot"]>;
  readonly bottlenecks: readonly string[];
  readonly recommendations: readonly string[];
}

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2));
  const echo = await startTcpEchoServer();
  const engine = createBenchmarkEngine(Math.max(...options.levels, options.maxActive) + 100);

  await engine.start();
  const address = engine.getInboundAddress("http-in");
  const proxyPort = getPort(address);
  const scenarios: ScenarioResult[] = [];

  try {
    for (const level of options.levels) {
      scenarios.push(await runScenario(level, proxyPort, echo.port, options, engine));
    }
  } finally {
    await engine.stop();
    await echo.close();
  }

  const report: BenchmarkReport = {
    generatedAt: new Date().toISOString(),
    options,
    scenarios,
    engineStats: engine.getStats(),
    leakSnapshot: engine.getLeakSnapshot(),
    resourceSnapshot: engine.getResourceSnapshot(),
    bottlenecks: analyzeBottlenecks(scenarios),
    recommendations: buildRecommendations(scenarios)
  };

  await mkdir(join("bench", "results"), { recursive: true });
  await writeFile(join("bench", "results", "latest.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(join("bench", "results", "latest.md"), renderMarkdown(report), "utf8");

  console.log(renderConsole(report));
};

const createBenchmarkEngine = (maxConnections: number): Engine => {
  return new Engine(
    parseConfig({
      log: { level: "silent" },
      limits: {
        connectTimeoutMs: 1_000,
        handshakeTimeoutMs: 1_000,
        idleTimeoutMs: 2_000,
        shutdownTimeoutMs: 2_000,
        maxHeaderBytes: 64 * 1024,
        maxConnections,
        leakReportIntervalMs: 60_000
      },
      inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
      outbounds: [{ type: "direct", tag: "direct" }],
      route: { defaultOutbound: "direct", rules: [] }
    }),
    new Logger("silent")
  );
};

const runScenario = async (
  targetConcurrency: number,
  proxyPort: number,
  targetPort: number,
  options: BenchmarkOptions,
  engine: Engine
): Promise<ScenarioResult> => {
  const effectiveConcurrency = Math.min(targetConcurrency, options.maxActive);
  const latencies: number[] = [];
  let successes = 0;
  let failures = 0;
  let bytes = 0;
  let next = 0;
  const memoryBefore = process.memoryUsage();
  const cpuBefore = process.cpuUsage();
  const startedAt = performance.now();

  const worker = async (): Promise<void> => {
    while (next < targetConcurrency) {
      const id = next;
      next += 1;
      try {
        const result = await runOneConnection(id, proxyPort, targetPort, options);
        successes += 1;
        bytes += result.bytes;
        latencies.push(result.durationMs);
      } catch {
        failures += 1;
      }
    }
  };

  await Promise.all(
    Array.from({ length: effectiveConcurrency }, async () => {
      await worker();
    })
  );
  await waitFor(() => engine.getActiveConnections().length === 0, 5_000);

  const durationMs = performance.now() - startedAt;
  const cpu = process.cpuUsage(cpuBefore);
  const memoryAfter = process.memoryUsage();
  const sorted = latencies.sort((left, right) => left - right);

  return {
    targetConcurrency,
    effectiveConcurrency,
    totalConnections: targetConcurrency,
    successes,
    failures,
    bytes,
    durationMs,
    throughputMbps: durationMs === 0 ? 0 : (bytes * 8) / (durationMs / 1000) / 1_000_000,
    latencyP50Ms: percentile(sorted, 0.5),
    latencyP95Ms: percentile(sorted, 0.95),
    latencyP99Ms: percentile(sorted, 0.99),
    cpuUserMs: cpu.user / 1000,
    cpuSystemMs: cpu.system / 1000,
    rssBeforeBytes: memoryBefore.rss,
    rssAfterBytes: memoryAfter.rss,
    heapUsedBeforeBytes: memoryBefore.heapUsed,
    heapUsedAfterBytes: memoryAfter.heapUsed
  };
};

const runOneConnection = async (
  connectionIndex: number,
  proxyPort: number,
  targetPort: number,
  options: BenchmarkOptions
): Promise<{ readonly bytes: number; readonly durationMs: number }> => {
  const socket = await connectTcp("127.0.0.1", proxyPort, options.timeoutMs, new Logger("silent"));
  const startedAt = performance.now();

  try {
    await writeSocket(socket, `CONNECT 127.0.0.1:${targetPort} HTTP/1.1\r\nHost: 127.0.0.1:${targetPort}\r\n\r\n`);
    const head = await readUntil(socket, (buffer) => buffer.includes("\r\n\r\n"), options.timeoutMs);
    if (!head.toString("latin1").startsWith("HTTP/1.1 200")) {
      throw new Error("CONNECT failed");
    }

    const payload = Buffer.alloc(options.payloadBytes, connectionIndex % 251);
    payload.writeUInt32BE(connectionIndex, 0);
    await writeSocket(socket, payload);
    const echoed = await readExact(socket, payload.byteLength, options.timeoutMs);
    if (!echoed.equals(payload)) {
      throw new Error("echo mismatch");
    }
    return {
      bytes: payload.byteLength * 2,
      durationMs: performance.now() - startedAt
    };
  } finally {
    closeSocket(socket);
  }
};

const startTcpEchoServer = async (): Promise<{ readonly port: number; close(): Promise<void> }> => {
  const server = net.createServer((socket) => {
    socket.on("error", () => undefined);
    socket.pipe(socket);
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.removeListener("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.removeListener("error", onError);
      resolve();
    };
    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(0, "127.0.0.1");
  });

  const address = server.address();
  if (typeof address !== "object" || address === null) {
    throw new Error("echo server failed to bind");
  }

  return {
    port: address.port,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((error?: Error) => {
          if (error !== undefined) {
            reject(error);
            return;
          }
          resolve();
        });
      });
    }
  };
};

const readExact = async (socket: net.Socket, length: number, timeoutMs: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;
  while (total < length) {
    const chunk = await readChunk(socket, timeoutMs);
    chunks.push(chunk);
    total += chunk.byteLength;
  }
  return Buffer.concat(chunks, total).subarray(0, length);
};

const readUntil = async (socket: net.Socket, predicate: (buffer: Buffer) => boolean, timeoutMs: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const chunk = await readChunk(socket, timeoutMs);
    chunks.push(chunk);
    total += chunk.byteLength;
    const combined = Buffer.concat(chunks, total);
    if (predicate(combined)) {
      return combined;
    }
  }
};

const readChunk = async (socket: net.Socket, timeoutMs: number): Promise<Buffer> => {
  return await new Promise<Buffer>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };

    const onData = (chunk: Buffer): void => {
      cleanup();
      resolve(chunk);
    };

    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };

    const onClose = (): void => {
      cleanup();
      reject(new Error("socket closed before benchmark read completed"));
    };

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`benchmark read timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    socket.once("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
};

const waitFor = async (predicate: () => boolean, timeoutMs: number): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 10);
    });
  }
  throw new Error("benchmark condition timed out");
};

const parseOptions = (args: readonly string[]): BenchmarkOptions => {
  const values = new Map<string, string>();
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === undefined || !arg.startsWith("--")) {
      throw new Error(`unexpected argument "${arg ?? ""}"`);
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`missing value for ${arg}`);
    }
    values.set(arg.slice(2), value);
    index += 1;
  }

  return {
    levels: parseLevels(values.get("levels") ?? "100,500,1000,5000"),
    maxActive: readInteger(values, "max-active", 128, 1, 10_000),
    payloadBytes: readInteger(values, "payload-bytes", 256, 4, 1024 * 1024),
    timeoutMs: readInteger(values, "timeout-ms", 2_000, 1, 300_000)
  };
};

const parseLevels = (raw: string): readonly number[] => {
  return raw.split(",").map((part) => {
    const value = Number(part.trim());
    if (!Number.isInteger(value) || value < 1 || value > 100_000) {
      throw new Error(`invalid benchmark level "${part}"`);
    }
    return value;
  });
};

const readInteger = (values: ReadonlyMap<string, string>, key: string, fallback: number, min: number, max: number): number => {
  const raw = values.get(key);
  if (raw === undefined) {
    return fallback;
  }
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`--${key} must be an integer between ${min} and ${max}`);
  }
  return value;
};

const getPort = (address: net.AddressInfo | string | null): number => {
  if (typeof address === "object" && address !== null) {
    return address.port;
  }
  throw new Error("expected TCP address");
};

const percentile = (values: readonly number[], ratio: number): number => {
  if (values.length === 0) {
    return 0;
  }
  const index = Math.min(values.length - 1, Math.floor(values.length * ratio));
  return values[index] ?? 0;
};

const analyzeBottlenecks = (scenarios: readonly ScenarioResult[]): readonly string[] => {
  const bottlenecks: string[] = [];
  const worst = scenarios.reduce<ScenarioResult | undefined>((current, scenario) => {
    if (current === undefined || scenario.latencyP95Ms > current.latencyP95Ms) {
      return scenario;
    }
    return current;
  }, undefined);

  if (worst !== undefined) {
    bottlenecks.push(`highest p95 latency at target ${worst.targetConcurrency}: ${worst.latencyP95Ms.toFixed(2)}ms`);
  }
  if (scenarios.some((scenario) => scenario.effectiveConcurrency < scenario.targetConcurrency)) {
    bottlenecks.push("local file-descriptor safety cap limited effective concurrency for high target levels");
  }
  if (scenarios.some((scenario) => scenario.failures > 0)) {
    bottlenecks.push("one or more benchmark requests failed and should be inspected before production tuning");
  }
  return bottlenecks;
};

const buildRecommendations = (scenarios: readonly ScenarioResult[]): readonly string[] => {
  const recommendations = [
    "run with a higher --max-active value on hosts with a higher ulimit -n to validate true 5000 simultaneous sockets",
    "compare rssAfterBytes and heapUsedAfterBytes over repeated runs to detect growth trends",
    "profile with node --cpu-prof when p95 latency grows faster than throughput"
  ];

  if (scenarios.every((scenario) => scenario.failures === 0)) {
    recommendations.push("current benchmark completed without failed requests");
  }
  return recommendations;
};

const renderConsole = (report: BenchmarkReport): string => {
  return [
    "sepigs benchmark completed",
    ...report.scenarios.map(
      (scenario) =>
        `target=${scenario.targetConcurrency} effective=${scenario.effectiveConcurrency} ok=${scenario.successes}/${scenario.totalConnections} throughput=${scenario.throughputMbps.toFixed(2)}Mbps p95=${scenario.latencyP95Ms.toFixed(2)}ms rss=${formatBytes(scenario.rssAfterBytes)}`
    ),
    `active leaks after stop: sockets=${report.leakSnapshot.activeSockets} timers=${report.leakSnapshot.activeTimers} listeners=${report.leakSnapshot.activeListeners}`,
    `report: bench/results/latest.md`
  ].join("\n");
};

const renderMarkdown = (report: BenchmarkReport): string => {
  const rows = report.scenarios
    .map(
      (scenario) =>
        `| ${scenario.targetConcurrency} | ${scenario.effectiveConcurrency} | ${scenario.successes}/${scenario.totalConnections} | ${scenario.throughputMbps.toFixed(2)} | ${scenario.latencyP50Ms.toFixed(2)} | ${scenario.latencyP95Ms.toFixed(2)} | ${scenario.latencyP99Ms.toFixed(2)} | ${formatBytes(scenario.rssAfterBytes)} | ${formatBytes(scenario.heapUsedAfterBytes)} | ${(scenario.cpuUserMs + scenario.cpuSystemMs).toFixed(2)} |`
    )
    .join("\n");

  return [
    "# sepigs Benchmark Report",
    "",
    `Generated: ${report.generatedAt}`,
    "",
    "| Target | Effective | Success | Mbps | p50 ms | p95 ms | p99 ms | RSS | Heap Used | CPU ms |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    rows,
    "",
    "## Connection Data",
    "",
    `- Total connections: ${report.engineStats.totalConnections}`,
    `- Active connections after stop: ${report.engineStats.activeConnections}`,
    `- Failed connections: ${report.engineStats.failedConnections}`,
    `- Rejected connections: ${report.engineStats.rejectedConnections}`,
    `- Average connection duration: ${report.engineStats.averageConnectionDurationMs.toFixed(2)}ms`,
    "",
    "## Leak Snapshot",
    "",
    `- Active sockets: ${report.leakSnapshot.activeSockets}`,
    `- Active timers: ${report.leakSnapshot.activeTimers}`,
    `- Active listeners: ${report.leakSnapshot.activeListeners}`,
    "",
    "## Bottlenecks",
    "",
    ...report.bottlenecks.map((item) => `- ${item}`),
    "",
    "## Recommendations",
    "",
    ...report.recommendations.map((item) => `- ${item}`),
    ""
  ].join("\n");
};

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KiB`;
  }
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
