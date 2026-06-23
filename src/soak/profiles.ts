export interface SoakProfileDefaults {
  readonly durationMs: number;
  readonly concurrency: number;
  readonly workerDelayMs: number;
  readonly runDir: string;
  readonly docsReportPath: string;
}

export const getSoakProfileDefaults = (profile: string): SoakProfileDefaults => {
  if (profile === "24h") {
    return {
      durationMs: 24 * 60 * 60 * 1_000,
      concurrency: 128,
      workerDelayMs: 750,
      runDir: "reports/soak/24h",
      docsReportPath: "docs/soak-24h-v0.2.0-beta-report.md"
    };
  }
  if (profile === "6h") {
    return {
      durationMs: 6 * 60 * 60 * 1_000,
      concurrency: 128,
      workerDelayMs: 750,
      runDir: "reports/soak/6h",
      docsReportPath: "docs/soak-6h-full-report.md"
    };
  }
  if (profile === "short") {
    return {
      durationMs: 10 * 60 * 1_000,
      concurrency: 16,
      workerDelayMs: 500,
      runDir: "reports/soak/short",
      docsReportPath: "docs/soak-full-short-report.md"
    };
  }
  return {
    durationMs: 60 * 60 * 1_000,
    concurrency: 64,
    workerDelayMs: 500,
    runDir: "reports/soak/1h",
    docsReportPath: "docs/soak-full-report.md"
  };
};
