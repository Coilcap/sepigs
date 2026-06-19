import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface SoakCheckpoint {
  readonly profile: string;
  readonly durationMs: number;
  readonly concurrency: number;
  readonly startedAt: number;
  readonly elapsedMs: number;
  readonly success: number;
  readonly errors: number;
  readonly bytes: number;
  readonly reloadCount: number;
  readonly infrastructurePauses: number;
  readonly suspendedMs: number;
  readonly latencies: readonly number[];
  readonly errorReasons: Readonly<Record<string, number>>;
  readonly completed: boolean;
  readonly updatedAt: number;
}

export interface SoakRunPaths {
  readonly runDir: string;
  readonly checkpoint: string;
  readonly metricsJsonl: string;
  readonly failuresJsonl: string;
  readonly summaryMd: string;
  readonly finalMd: string;
  readonly connectionsJson: string;
}

export const createSoakRunPaths = (runDir: string): SoakRunPaths => {
  return {
    runDir,
    checkpoint: join(runDir, "checkpoint.json"),
    metricsJsonl: join(runDir, "metrics.jsonl"),
    failuresJsonl: join(runDir, "failures.jsonl"),
    summaryMd: join(runDir, "summary.md"),
    finalMd: join(runDir, "final.md"),
    connectionsJson: join(runDir, "connections-final.json")
  };
};

export const ensureSoakRunDir = async (paths: SoakRunPaths): Promise<void> => {
  await mkdir(paths.runDir, { recursive: true });
};

export const loadSoakCheckpoint = async (paths: SoakRunPaths): Promise<SoakCheckpoint | undefined> => {
  try {
    return JSON.parse(await readFile(paths.checkpoint, "utf8")) as SoakCheckpoint;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
};

export const writeSoakCheckpoint = async (paths: SoakRunPaths, checkpoint: SoakCheckpoint): Promise<void> => {
  await writeFile(paths.checkpoint, `${JSON.stringify(checkpoint, null, 2)}\n`, "utf8");
};

export const appendSoakJsonl = async (path: string, value: unknown): Promise<void> => {
  await appendFile(path, `${JSON.stringify(value)}\n`, "utf8");
};
