import { writeFile } from "node:fs/promises";
import type { SoakCheckpoint, SoakRunPaths } from "./checkpoint.js";

export interface SoakResourceSample {
  readonly atMs: number;
  readonly rss: number;
  readonly heapUsed: number;
  readonly activeSockets: number;
  readonly activeTimers: number;
  readonly activeListeners: number;
  readonly openFileDescriptors?: number;
}

export interface SoakReportInput {
  readonly checkpoint: SoakCheckpoint;
  readonly latestSample?: SoakResourceSample;
  readonly finalSample?: SoakResourceSample;
  readonly eventLoopP95Ms: number;
  readonly gcCount: number;
  readonly gcTotalDurationMs: number;
  readonly failoverCount: number;
  readonly interrupted: boolean;
}

export const writeSoakSummary = async (paths: SoakRunPaths, input: SoakReportInput): Promise<void> => {
  await writeFile(paths.summaryMd, renderSoakReport(input), "utf8");
};

export const writeSoakFinalReport = async (paths: SoakRunPaths, input: SoakReportInput, docsPath?: string): Promise<void> => {
  const rendered = renderSoakReport(input);
  await writeFile(paths.finalMd, rendered, "utf8");
  if (docsPath !== undefined) {
    await writeFile(docsPath, rendered, "utf8");
  }
};

export const renderSoakReport = (input: SoakReportInput): string => {
  const checkpoint = input.checkpoint;
  const total = checkpoint.success + checkpoint.errors;
  const successRate = total === 0 ? 0 : checkpoint.success / total;
  const sorted = [...checkpoint.latencies].sort((left, right) => left - right);
  return [
    "# Full Soak Report",
    "",
    `- profile: ${checkpoint.profile}`,
    `- durationMs: ${checkpoint.durationMs}`,
    `- elapsedMs: ${checkpoint.elapsedMs}`,
    `- concurrency: ${checkpoint.concurrency}`,
    `- completed: ${checkpoint.completed}`,
    `- interrupted: ${input.interrupted}`,
    `- totalRequests: ${total}`,
    `- success: ${checkpoint.success}`,
    `- errors: ${checkpoint.errors}`,
    `- errorReasons: ${JSON.stringify(checkpoint.errorReasons)}`,
    `- successRate: ${successRate}`,
    `- bytes: ${checkpoint.bytes}`,
    `- latencyP50Ms: ${percentile(sorted, 0.5).toFixed(2)}`,
    `- latencyP95Ms: ${percentile(sorted, 0.95).toFixed(2)}`,
    `- latencyP99Ms: ${percentile(sorted, 0.99).toFixed(2)}`,
    `- eventLoopP95Ms: ${input.eventLoopP95Ms.toFixed(2)}`,
    `- gcCount: ${input.gcCount}`,
    `- gcTotalDurationMs: ${input.gcTotalDurationMs.toFixed(2)}`,
    `- reloadCount: ${checkpoint.reloadCount}`,
    `- infrastructurePauses: ${checkpoint.infrastructurePauses}`,
    `- suspendedMs: ${checkpoint.suspendedMs}`,
    `- failoverCount: ${input.failoverCount}`,
    renderSample("latest", input.latestSample),
    renderSample("final", input.finalSample),
    "",
    "Artifacts:",
    "",
    "- `checkpoint.json`",
    "- `metrics.jsonl`",
    "- `failures.jsonl`",
    "- `connections-final.json`",
    ""
  ].join("\n");
};

const renderSample = (label: string, sample: SoakResourceSample | undefined): string => {
  if (sample === undefined) {
    return `- ${label}: n/a`;
  }
  return `- ${label}: rss=${toMiB(sample.rss)}MiB heap=${toMiB(sample.heapUsed)}MiB sockets=${sample.activeSockets} timers=${sample.activeTimers} listeners=${sample.activeListeners} fd=${sample.openFileDescriptors ?? "n/a"}`;
};

const toMiB = (bytes: number): string => {
  return (bytes / 1024 / 1024).toFixed(2);
};

const percentile = (values: readonly number[], p: number): number => {
  if (values.length === 0) {
    return 0;
  }
  return values[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;
};
