import { runFullSoak, type FullSoakOptions } from "../../src/soak/runner.js";
import { getSoakProfileDefaults } from "../../src/soak/profiles.js";

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
  const defaults = getSoakProfileDefaults(profile);
  return {
    profile,
    durationMs: Number(value("--duration-ms", process.env.SEPIGS_SOAK_DURATION ?? String(defaults.durationMs))),
    concurrency: Number(value("--concurrency", process.env.SEPIGS_SOAK_CONCURRENCY ?? String(defaults.concurrency))),
    workerDelayMs: Number(value("--worker-delay-ms", process.env.SEPIGS_SOAK_WORKER_DELAY_MS ?? String(defaults.workerDelayMs))),
    reloadIntervalMs: Number(value("--reload-interval-ms", process.env.SEPIGS_SOAK_RELOAD_INTERVAL ?? "5000")),
    sampleIntervalMs: Number(value("--sample-interval-ms", process.env.SEPIGS_SOAK_SAMPLE_INTERVAL ?? "60000")),
    summaryIntervalMs: Number(value("--summary-interval-ms", process.env.SEPIGS_SOAK_SUMMARY_INTERVAL ?? "300000")),
    runDir: value("--run-dir", defaults.runDir),
    docsReportPath: value("--docs-report", defaults.docsReportPath),
    resume: flag("--resume")
  };
}
