import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { SING_BOX_M2_POLICY } from "./cases/sing-box.js";
import { XRAY_M2_POLICY } from "./cases/xray.js";
import type { ReferenceDetectionReport } from "./reference-detector.js";
import type { CompatibilitySummary, ExternalCompatibilityCase } from "./types.js";
import { summarizeCases } from "./types.js";

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

interface ReferenceReport {
  readonly generatedAt: string;
  readonly implementation: "sing-box" | "xray";
  readonly referenceVersions: readonly string[];
  readonly capabilityNotes: readonly string[];
  readonly cases: readonly ExternalCompatibilityCase[];
  readonly summary: CompatibilitySummary;
}

const main = async (): Promise<void> => {
  const detection = await readJson<ReferenceDetectionReport>("reports/compat/reference-detection.json");
  const harness = await readJson<HarnessReport>("reports/compat/external-v1.json");
  const report: CombinedReport = {
    generatedAt: new Date().toISOString(),
    detection,
    harness
  };
  const singBoxReport = createReferenceReport("sing-box", harness.cases, [
    SING_BOX_M2_POLICY.trojan.tlsCapabilityNote,
    "Shadowsocks UDP certification remains unsupported."
  ]);
  const xrayReport = createReferenceReport("xray", harness.cases, [
    XRAY_M2_POLICY.trojan.tlsCapabilityNote,
    "Only sepigs-supported Shadowsocks AEAD ciphers are in scope."
  ]);
  await mkdir("reports/compat", { recursive: true });
  await Promise.all([
    writeFile("reports/compat/external-summary-v1.json", `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile("reports/compat/external-summary-v1.md", renderMarkdown(report), "utf8"),
    writeFile("reports/compat/sing-box-v0.3.0-m2.json", `${JSON.stringify(singBoxReport, null, 2)}\n`, "utf8"),
    writeFile("reports/compat/sing-box-v0.3.0-m2.md", renderReferenceMarkdown(singBoxReport), "utf8"),
    writeFile("reports/compat/xray-v0.3.0-m2.json", `${JSON.stringify(xrayReport, null, 2)}\n`, "utf8"),
    writeFile("reports/compat/xray-v0.3.0-m2.md", renderReferenceMarkdown(xrayReport), "utf8")
  ]);
  console.log(`external compatibility report: ${JSON.stringify(harness.summary)}`);
};

const createReferenceReport = (
  implementation: "sing-box" | "xray",
  cases: readonly ExternalCompatibilityCase[],
  capabilityNotes: readonly string[]
): ReferenceReport => {
  const selected = cases.filter((item) => item.referenceImplementation === implementation);
  return {
    generatedAt: new Date().toISOString(),
    implementation,
    referenceVersions: [...new Set(selected.map((item) => item.referenceVersion).filter((value) => value.length > 0))],
    capabilityNotes,
    cases: selected,
    summary: summarizeCases(selected)
  };
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

const renderReferenceMarkdown = (report: ReferenceReport): string => [
  `# ${report.implementation} External Compatibility v0.3.0 M2`,
  "",
  `- Generated: ${report.generatedAt}`,
  `- Versions: ${report.referenceVersions.join("; ") || "unknown"}`,
  `- Summary: ${JSON.stringify(report.summary)}`,
  "",
  "## Capability Notes",
  "",
  ...report.capabilityNotes.map((note) => `- ${note}`),
  "",
  "| Case | Role | Protocol/cipher | Payload | Concurrency | Result | Reason | Reproduction |",
  "| --- | --- | --- | ---: | ---: | --- | --- | --- |",
  ...report.cases.map((item) =>
    `| ${item.caseId} | ${item.sepigsRole} | ${item.protocol}${item.cipher === undefined ? "" : `/${item.cipher}`} | ${item.payloadSize} | ${item.concurrency ?? 1} | ${item.result} | ${escapeCell(item.reason)} | \`${item.reproductionCommand}\` |`
  ),
  "",
  "Only verified rows are positive external interoperability evidence.",
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
