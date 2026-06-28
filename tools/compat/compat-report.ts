import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReferenceDetectionReport } from "./reference-detector.js";
import type { CompatibilitySummary, ExternalCompatibilityCase } from "./types.js";

interface HarnessReport {
  readonly generatedAt: string;
  readonly cases: readonly ExternalCompatibilityCase[];
  readonly summary: CompatibilitySummary;
}

interface CombinedReport {
  readonly generatedAt: string;
  readonly detection: ReferenceDetectionReport;
  readonly harness: HarnessReport;
}

const main = async (): Promise<void> => {
  const detection = await readJson<ReferenceDetectionReport>("reports/compat/reference-detection.json");
  const harness = await readJson<HarnessReport>("reports/compat/external-v1.json");
  const report: CombinedReport = {
    generatedAt: new Date().toISOString(),
    detection,
    harness
  };
  await mkdir("reports/compat", { recursive: true });
  await Promise.all([
    writeFile("reports/compat/external-summary-v1.json", `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile("reports/compat/external-summary-v1.md", renderMarkdown(report), "utf8")
  ]);
  console.log(`external compatibility report: ${JSON.stringify(harness.summary)}`);
};

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

const renderMarkdown = (report: CombinedReport): string => [
  "# External Compatibility Summary v1",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Detection generated: ${report.detection.generatedAt}`,
  `- Harness generated: ${report.harness.generatedAt}`,
  `- Result counts: ${JSON.stringify(report.harness.summary)}`,
  "",
  "## Reference Detection",
  "",
  "| Implementation | Status | Versions |",
  "| --- | --- | --- |",
  ...report.detection.implementations.map((item) =>
    `| ${item.implementation} | ${item.status} | ${escapeCell(item.binaries.map((binary) => `${binary.name}: ${binary.versionOutput || binary.status}`).join("; "))} |`
  ),
  "",
  "## Harness Results",
  "",
  "| Case | Reference | Result | Reason |",
  "| --- | --- | --- | --- |",
  ...report.harness.cases.map((item) =>
    `| ${item.caseId} | ${item.referenceImplementation} | ${item.result} | ${escapeCell(item.reason)} |`
  ),
  "",
  "Only cases marked verified have external process and payload evidence.",
  ""
].join("\n");

const escapeCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ");

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(`compatibility report failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
