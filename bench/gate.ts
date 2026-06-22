import { readFile, writeFile } from "node:fs/promises";

interface Scenario { readonly targetConcurrency: number; readonly throughputMbps: number; readonly latencyP95Ms: number; readonly rssAfterBytes: number }
interface Baseline { readonly throughputMinRatio: number; readonly p95MaxRatio: number; readonly rssMaxRatio: number; readonly scenarios: readonly Scenario[] }
interface TcpReport { readonly scenarios: readonly Scenario[]; readonly leakSnapshot: { readonly activeSockets: number; readonly activeTimers: number; readonly activeListeners: number } }
interface UdpReport { readonly errors: number; readonly leaks: { readonly activeSockets: number; readonly activeTimers: number; readonly activeListeners: number } }

const baseline = JSON.parse(await readFile("bench/baselines/v0.2.0-beta.json", "utf8")) as Baseline;
const tcp = JSON.parse(await readFile("bench/results/latest.json", "utf8")) as TcpReport;
const udp = JSON.parse(await readFile("bench/results/udp-latest.json", "utf8")) as UdpReport;
const rows: string[] = []; let passed = true;
for (const expected of baseline.scenarios) { const actual = tcp.scenarios.find((item) => item.targetConcurrency === expected.targetConcurrency); if (actual === undefined) { rows.push(`| ${expected.targetConcurrency} | failed | missing scenario |`); passed = false; continue; } const checks = [actual.throughputMbps >= expected.throughputMbps * baseline.throughputMinRatio, actual.latencyP95Ms <= expected.latencyP95Ms * baseline.p95MaxRatio, actual.rssAfterBytes <= expected.rssAfterBytes * baseline.rssMaxRatio]; const ok = checks.every(Boolean); passed = passed && ok; rows.push(`| ${expected.targetConcurrency} | ${ok ? "passed" : "failed"} | throughput ${actual.throughputMbps.toFixed(2)}, p95 ${actual.latencyP95Ms.toFixed(2)} ms, RSS ${(actual.rssAfterBytes / 1_048_576).toFixed(2)} MiB |`); }
const resourcesClean = [tcp.leakSnapshot.activeSockets, tcp.leakSnapshot.activeTimers, tcp.leakSnapshot.activeListeners, udp.leaks.activeSockets, udp.leaks.activeTimers, udp.leaks.activeListeners].every((value) => value === 0); const udpOk = udp.errors === 0; passed = passed && resourcesClean && udpOk;
const report = ["# v0.2.0-beta Performance Gate", "", "| TCP target | Status | Measurements |", "| ---: | --- | --- |", ...rows, "", `- UDP errors: ${udp.errors} (${udpOk ? "passed" : "failed"})`, `- Final resources clean: ${resourcesClean ? "passed" : "failed"}`, `- Overall: ${passed ? "passed" : "failed"}`, ""].join("\n"); await writeFile("bench/results/gate-latest.md", report, "utf8"); console.log(`benchmark gate ${passed ? "passed" : "failed"}`); if (!passed) process.exitCode = 1;
