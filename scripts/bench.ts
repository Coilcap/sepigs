#!/usr/bin/env tsx
import net from "node:net";
import { performance } from "node:perf_hooks";
import { Logger } from "../src/logger/logger.js";
import { connectTcp, writeSocket } from "../src/utils/net.js";

interface BenchOptions {
  readonly proxyHost: string;
  readonly proxyPort: number;
  readonly targetHost: string;
  readonly targetPort: number;
  readonly connections: number;
  readonly rounds: number;
  readonly payloadBytes: number;
  readonly timeoutMs: number;
}

interface BenchResult {
  readonly bytes: number;
  readonly durationMs: number;
}

const DEFAULT_OPTIONS: BenchOptions = {
  proxyHost: "127.0.0.1",
  proxyPort: 8080,
  targetHost: "127.0.0.1",
  targetPort: 9000,
  connections: 20,
  rounds: 20,
  payloadBytes: 1024,
  timeoutMs: 5_000
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = performance.now();
  const results = await Promise.all(
    Array.from({ length: options.connections }, async (_unused, index) => await runConnection(index, options))
  );
  const durationMs = performance.now() - startedAt;
  const bytes = results.reduce((sum, result) => sum + result.bytes, 0);
  const sortedDurations = results.map((result) => result.durationMs).sort((left, right) => left - right);
  const throughputMbps = (bytes * 8) / (durationMs / 1000) / 1_000_000;

  console.log("sepigs benchmark");
  console.log(`proxy: ${options.proxyHost}:${options.proxyPort}`);
  console.log(`target: ${options.targetHost}:${options.targetPort}`);
  console.log(`connections: ${options.connections}, rounds: ${options.rounds}, payload: ${options.payloadBytes} bytes`);
  console.log(`total bytes echoed: ${bytes}`);
  console.log(`wall time: ${durationMs.toFixed(2)} ms`);
  console.log(`throughput: ${throughputMbps.toFixed(2)} Mbps`);
  console.log(`connection duration p50/p95: ${percentile(sortedDurations, 0.5).toFixed(2)} ms / ${percentile(sortedDurations, 0.95).toFixed(2)} ms`);
};

const runConnection = async (connectionIndex: number, options: BenchOptions): Promise<BenchResult> => {
  const socket = await connectTcp(options.proxyHost, options.proxyPort, options.timeoutMs, new Logger("silent"));
  const startedAt = performance.now();
  let bytes = 0;

  try {
    await writeSocket(
      socket,
      `CONNECT ${options.targetHost}:${options.targetPort} HTTP/1.1\r\nHost: ${options.targetHost}:${options.targetPort}\r\n\r\n`
    );
    const head = await readUntil(socket, (buffer) => buffer.includes("\r\n\r\n"), options.timeoutMs);
    if (!head.toString("latin1").startsWith("HTTP/1.1 200")) {
      throw new Error(`proxy CONNECT failed: ${head.toString("latin1").split("\r\n")[0] ?? "unknown response"}`);
    }

    const payload = Buffer.alloc(options.payloadBytes, connectionIndex % 256);
    for (let round = 0; round < options.rounds; round += 1) {
      payload.writeUInt32BE(round, 0);
      await writeSocket(socket, payload);
      const echoed = await readExact(socket, payload.byteLength, options.timeoutMs);
      if (!echoed.equals(payload)) {
        throw new Error(`echo mismatch on connection ${connectionIndex}, round ${round}`);
      }
      bytes += payload.byteLength * 2;
    }

    return {
      bytes,
      durationMs: performance.now() - startedAt
    };
  } finally {
    socket.destroy();
  }
};

const readExact = async (socket: net.Socket, length: number, timeoutMs: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;
  while (total < length) {
    const chunk = await readNextChunk(socket, timeoutMs);
    chunks.push(chunk);
    total += chunk.byteLength;
  }

  const combined = Buffer.concat(chunks, total);
  return combined.subarray(0, length);
};

const readUntil = async (socket: net.Socket, predicate: (buffer: Buffer) => boolean, timeoutMs: number): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  let total = 0;
  for (;;) {
    const chunk = await readNextChunk(socket, timeoutMs);
    chunks.push(chunk);
    total += chunk.byteLength;
    const combined = Buffer.concat(chunks, total);
    if (predicate(combined)) {
      return combined;
    }
  }
};

const readNextChunk = async (socket: net.Socket, timeoutMs: number): Promise<Buffer> => {
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
      reject(new Error("socket closed while reading benchmark data"));
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

const parseArgs = (args: readonly string[]): BenchOptions => {
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
    proxyHost: values.get("proxy-host") ?? DEFAULT_OPTIONS.proxyHost,
    proxyPort: readInteger(values, "proxy-port", DEFAULT_OPTIONS.proxyPort, 1, 65_535),
    targetHost: values.get("target-host") ?? DEFAULT_OPTIONS.targetHost,
    targetPort: readInteger(values, "target-port", DEFAULT_OPTIONS.targetPort, 1, 65_535),
    connections: readInteger(values, "connections", DEFAULT_OPTIONS.connections, 1, 10_000),
    rounds: readInteger(values, "rounds", DEFAULT_OPTIONS.rounds, 1, 100_000),
    payloadBytes: readInteger(values, "payload-bytes", DEFAULT_OPTIONS.payloadBytes, 4, 1024 * 1024),
    timeoutMs: readInteger(values, "timeout-ms", DEFAULT_OPTIONS.timeoutMs, 1, 300_000)
  };
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

const percentile = (sortedValues: readonly number[], ratio: number): number => {
  if (sortedValues.length === 0) {
    return 0;
  }
  const index = Math.min(sortedValues.length - 1, Math.floor(sortedValues.length * ratio));
  return sortedValues[index] ?? 0;
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
