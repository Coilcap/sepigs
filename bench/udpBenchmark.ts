import dgram from "node:dgram";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import { performance } from "node:perf_hooks";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { encodeSocksUdpPacket, parseSocksUdpPacket } from "../src/inbound/socks5Udp.js";
import { makeDestination } from "../src/utils/net.js";
import { readTestNetworkConfig } from "../src/utils/testNetwork.js";

interface UdpBenchmarkReport {
  readonly generatedAt: string;
  readonly packets: number;
  readonly payloadBytes: number;
  readonly successes: number;
  readonly errors: number;
  readonly durationMs: number;
  readonly throughputMbps: number;
  readonly p50Ms: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly rssBeforeBytes: number;
  readonly rssAfterBytes: number;
  readonly stats: ReturnType<Engine["getStats"]>;
  readonly leaks: ReturnType<Engine["getLeakSnapshot"]>;
}

const network = readTestNetworkConfig();
const packets = readInteger(process.env.SEPIGS_UDP_BENCH_PACKETS, 2_000);
const payloadBytes = readInteger(process.env.SEPIGS_UDP_BENCH_PAYLOAD, 256);
const echo = await startUdpEcho();
const engine = new Engine(parseConfig({ log: { level: "silent" }, limits: { maxUdpSessions: 8, udpIdleTimeoutMs: 5_000 }, inbounds: [{ type: "socks5", tag: "socks", listen: network.host, port: 0, udpAssociate: true }], outbounds: [{ type: "direct", tag: "direct" }], route: { defaultOutbound: "direct", rules: [] } }));
await engine.start();
const control = await connect(getPort(engine.getInboundAddress("socks")));
const udp = dgram.createSocket("udp4");
const latencies: number[] = []; let successes = 0; let errors = 0; const memoryBefore = process.memoryUsage(); const startedAt = performance.now();

try {
  control.write(Buffer.from([5, 1, 0])); await readBytes(control, 2);
  control.write(Buffer.from([5, 3, 0, 1, 0, 0, 0, 0, 0, 0])); const reply = await readBytes(control, 10); const relayPort = ((reply[8] ?? 0) << 8) + (reply[9] ?? 0);
  for (let index = 0; index < packets; index += 1) {
    const payload = Buffer.alloc(payloadBytes, index % 251); payload.writeUInt32BE(index, 0); const packet = encodeSocksUdpPacket(makeDestination(network.host, echo.port), payload); const started = performance.now();
    try { const response = parseSocksUdpPacket(await sendAndReceive(udp, relayPort, packet)); if (!response.payload.equals(payload)) throw new Error("UDP echo mismatch"); successes += 1; }
    catch { errors += 1; }
    latencies.push(performance.now() - started);
  }
} finally {
  control.destroy(); udp.close(); await new Promise((resolve) => setTimeout(resolve, 30)); await engine.stop(); await echo.close();
}

const durationMs = performance.now() - startedAt; const sorted = latencies.sort((left, right) => left - right); const memoryAfter = process.memoryUsage();
const report: UdpBenchmarkReport = { generatedAt: new Date().toISOString(), packets, payloadBytes, successes, errors, durationMs, throughputMbps: (successes * payloadBytes * 2 * 8) / (durationMs / 1_000) / 1_000_000, p50Ms: percentile(sorted, 0.5), p95Ms: percentile(sorted, 0.95), p99Ms: percentile(sorted, 0.99), rssBeforeBytes: memoryBefore.rss, rssAfterBytes: memoryAfter.rss, stats: engine.getStats(), leaks: engine.getLeakSnapshot() };
await mkdir("bench/results", { recursive: true }); await writeFile("bench/results/udp-latest.json", `${JSON.stringify(report, null, 2)}\n`, "utf8"); await writeFile("bench/results/udp-latest.md", render(report), "utf8");
console.log(`UDP benchmark: ${successes}/${packets} ok errors=${errors} throughput=${report.throughputMbps.toFixed(2)}Mbps p95=${report.p95Ms.toFixed(2)}ms`);
if (errors > 0 || report.leaks.activeSockets !== 0 || report.leaks.activeTimers !== 0 || report.leaks.activeListeners !== 0) process.exitCode = 1;

async function startUdpEcho(): Promise<{ port: number; close(): Promise<void> }> { const socket = dgram.createSocket("udp4"); socket.on("message", (message, rinfo) => { socket.send(message, rinfo.port, rinfo.address); }); await new Promise<void>((resolve, reject) => { socket.once("error", reject); socket.bind(network.port, network.host, resolve); }); return { port: socket.address().port, close: async () => { await new Promise<void>((resolve) => socket.close(() => { resolve(); })); } }; }
async function connect(port: number): Promise<net.Socket> { return await new Promise((resolve, reject) => { const socket = net.createConnection({ host: network.host, port }); socket.once("connect", () => { resolve(socket); }); socket.once("error", reject); }); }
async function readBytes(socket: net.Socket, length: number): Promise<Buffer> { return await new Promise((resolve, reject) => { const chunks: Buffer[] = []; let total = 0; const timer = setTimeout(() => { cleanup(); reject(new Error("read timeout")); }, 2_000); const cleanup = (): void => { clearTimeout(timer); socket.removeListener("data", onData); socket.removeListener("error", onError); }; const onError = (error: Error): void => { cleanup(); reject(error); }; const onData = (chunk: Buffer): void => { chunks.push(chunk); total += chunk.byteLength; if (total >= length) { cleanup(); resolve(Buffer.concat(chunks, total)); } }; socket.on("data", onData); socket.once("error", onError); }); }
async function sendAndReceive(socket: dgram.Socket, port: number, packet: Buffer): Promise<Buffer> { return await new Promise((resolve, reject) => { const timer = setTimeout(() => { cleanup(); reject(new Error("UDP timeout")); }, 2_000); const cleanup = (): void => { clearTimeout(timer); socket.removeListener("message", onMessage); socket.removeListener("error", onError); }; const onMessage = (message: Buffer): void => { cleanup(); resolve(message); }; const onError = (error: Error): void => { cleanup(); reject(error); }; socket.once("message", onMessage); socket.once("error", onError); socket.send(packet, port, network.host, (error) => { if (error !== null) onError(error); }); }); }
function getPort(address: net.AddressInfo | string | null): number { if (typeof address === "object" && address !== null) return address.port; throw new Error("expected bound address"); }
function percentile(values: readonly number[], ratio: number): number { return values[Math.min(values.length - 1, Math.floor(values.length * ratio))] ?? 0; }
function readInteger(raw: string | undefined, fallback: number): number { const value = Number(raw ?? fallback); if (!Number.isInteger(value) || value < 1) throw new Error("UDP benchmark options must be positive integers"); return value; }
function render(value: UdpBenchmarkReport): string { return ["# UDP Benchmark", "", `Generated: ${value.generatedAt}`, "", `- Packets: ${value.successes}/${value.packets}`, `- Errors: ${value.errors}`, `- Payload: ${value.payloadBytes} bytes`, `- Throughput: ${value.throughputMbps.toFixed(2)} Mbps`, `- Latency p50/p95/p99: ${value.p50Ms.toFixed(2)} / ${value.p95Ms.toFixed(2)} / ${value.p99Ms.toFixed(2)} ms`, `- RSS before/after: ${(value.rssBeforeBytes / 1_048_576).toFixed(2)} / ${(value.rssAfterBytes / 1_048_576).toFixed(2)} MiB`, `- UDP sessions total/active: ${value.stats.udpSessionsTotal ?? 0} / ${value.stats.udpSessionsActive ?? 0}`, `- Packets upload/download: ${value.stats.udpPacketsClientToRemote} / ${value.stats.udpPacketsRemoteToClient}`, `- Final sockets/timers/listeners: ${value.leaks.activeSockets}/${value.leaks.activeTimers}/${value.leaks.activeListeners}`, ""].join("\n"); }
