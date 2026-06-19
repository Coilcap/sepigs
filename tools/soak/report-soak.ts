import { createSoakRunPaths, loadSoakCheckpoint } from "../../src/soak/checkpoint.js";
import { writeSoakFinalReport } from "../../src/soak/reporter.js";

const args = process.argv.slice(2);
const runDir = value("--run-dir", "reports/soak/1h");
const docsReport = value("--docs-report", "docs/soak-full-report.md");

const paths = createSoakRunPaths(runDir);
const checkpoint = await loadSoakCheckpoint(paths);
if (checkpoint === undefined) {
  console.error(`no checkpoint found at ${paths.checkpoint}`);
  process.exitCode = 1;
} else {
  await writeSoakFinalReport(
    paths,
    {
      checkpoint,
      eventLoopP95Ms: 0,
      gcCount: 0,
      gcTotalDurationMs: 0,
      failoverCount: 0,
      interrupted: !checkpoint.completed
    },
    docsReport
  );
  console.log(`soak report written: ${paths.finalMd} and ${docsReport}`);
}

function value(name: string, fallback: string): string {
  const index = args.indexOf(name);
  return index >= 0 ? (args[index + 1] ?? fallback) : fallback;
}
