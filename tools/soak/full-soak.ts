import { runFullSoak, type FullSoakOptions } from "../../src/soak/runner.js";

const options = parseArgs(process.argv.slice(2));

runFullSoak(options).then(
  (result) => {
    console.log(
      [
        `full soak completed: profile=${result.checkpoint.profile}`,
        `completed=${result.checkpoint.completed}`,
        `interrupted=${result.interrupted}`,
        `success=${result.checkpoint.success}`,
        `errors=${result.checkpoint.errors}`,
        `runDir=${result.paths.runDir}`
      ].join(" ")
    );
    if (result.errors > 0 || result.interrupted) {
      process.exitCode = result.interrupted ? 130 : 1;
    }
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.stack : String(error));
    process.exitCode = 1;
  }
);

function parseArgs(args: readonly string[]): FullSoakOptions {
  const value = (name: string, fallback: string): string => {
    const index = args.indexOf(name);
    return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
  };
  const flag = (name: string): boolean => args.includes(name);
  const profile = value("--profile", "1h");
  return {
    profile,
    durationMs: Number(value("--duration-ms", process.env.SEPIGS_SOAK_DURATION ?? defaultDurationMs(profile))),
    concurrency: Number(value("--concurrency", process.env.SEPIGS_SOAK_CONCURRENCY ?? defaultConcurrency(profile))),
    workerDelayMs: Number(value("--worker-delay-ms", process.env.SEPIGS_SOAK_WORKER_DELAY_MS ?? defaultWorkerDelayMs(profile))),
    reloadIntervalMs: Number(value("--reload-interval-ms", process.env.SEPIGS_SOAK_RELOAD_INTERVAL ?? "5000")),
    sampleIntervalMs: Number(value("--sample-interval-ms", process.env.SEPIGS_SOAK_SAMPLE_INTERVAL ?? "60000")),
    summaryIntervalMs: Number(value("--summary-interval-ms", process.env.SEPIGS_SOAK_SUMMARY_INTERVAL ?? "300000")),
    runDir: value("--run-dir", defaultRunDir(profile)),
    docsReportPath: value("--docs-report", defaultDocsReport(profile)),
    resume: flag("--resume")
  };
}

function defaultDurationMs(profile: string): string {
  if (profile === "6h") {
    return "21600000";
  }
  if (profile === "short") {
    return "600000";
  }
  return "3600000";
}

function defaultConcurrency(profile: string): string {
  if (profile === "6h") {
    return "128";
  }
  if (profile === "short") {
    return "16";
  }
  return "64";
}

function defaultWorkerDelayMs(profile: string): string {
  return profile === "6h" ? "750" : "500";
}

function defaultRunDir(profile: string): string {
  if (profile === "6h") {
    return "reports/soak/6h";
  }
  if (profile === "short") {
    return "reports/soak/short";
  }
  return "reports/soak/1h";
}

function defaultDocsReport(profile: string): string {
  if (profile === "6h") {
    return "docs/soak-6h-full-report.md";
  }
  if (profile === "short") {
    return "docs/soak-full-short-report.md";
  }
  return "docs/soak-full-report.md";
}
