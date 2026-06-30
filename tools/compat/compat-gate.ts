import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { CompatibilitySummary, ExternalCompatibilityCase } from "./types.js";

interface HarnessReport {
  readonly generatedAt: string;
  readonly cases: readonly ExternalCompatibilityCase[];
  readonly summary: CompatibilitySummary;
}

interface ImplementationBaseline {
  readonly versionPrefix: string;
  readonly verified: number;
}

interface CompatibilityBaseline {
  readonly schemaVersion: 1;
  readonly baselineName: string;
  readonly createdAt: string;
  readonly source: string;
  readonly changeNote: string;
  readonly maximumVerifiedDropPercent: number;
  readonly implementations: Readonly<Record<"sing-box" | "xray", ImplementationBaseline>>;
}

interface GateResult {
  readonly generatedAt: string;
  readonly baselineName: string;
  readonly passed: boolean;
  readonly findings: readonly string[];
  readonly currentSummary: CompatibilitySummary;
  readonly implementations: Readonly<Record<string, {
    readonly baselineVerified: number;
    readonly currentVerified: number;
    readonly verifiedDropPercent: number;
  }>>;
}

export const evaluateCompatibilityGate = (
  baseline: CompatibilityBaseline,
  report: HarnessReport
): GateResult => {
  const findings: string[] = [];
  if (baseline.changeNote.trim().length === 0) findings.push("baseline changeNote is required");
  for (const item of report.cases) {
    if (item.result === "failed") findings.push(`failed case: ${item.caseId}: ${item.reason}`);
    if ((item.result === "blocked" || item.result === "skipped") && item.reason.trim().length === 0) {
      findings.push(`${item.result} case has no reason: ${item.caseId}`);
    }
    if (item.result === "unsupported" && item.reason.trim().length === 0) {
      findings.push(`unsupported case has no capability note: ${item.caseId}`);
    }
  }
  const implementationEntries: [string, GateResult["implementations"][string]][] = [];
  for (const [name, expected] of Object.entries(baseline.implementations)) {
    const cases = report.cases.filter((item) => item.referenceImplementation === name);
    const currentVerified = cases.filter((item) => item.result === "verified").length;
    const drop = expected.verified === 0 ? 0 : ((expected.verified - currentVerified) / expected.verified) * 100;
    const entry = {
      baselineVerified: expected.verified,
      currentVerified,
      verifiedDropPercent: Math.max(0, Number(drop.toFixed(2)))
    };
    implementationEntries.push([name, entry]);
    if (drop > baseline.maximumVerifiedDropPercent) {
      findings.push(
        `${name} verified count dropped ${drop.toFixed(2)}% (${String(expected.verified)} -> ${String(currentVerified)})`
      );
    }
    const versions = cases.map((item) => item.referenceVersion).filter((value) => value.length > 0);
    if (versions.length === 0 || !versions.every((version) => version.startsWith(expected.versionPrefix))) {
      findings.push(`${name} version does not match baseline prefix "${expected.versionPrefix}"`);
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    baselineName: baseline.baselineName,
    passed: findings.length === 0,
    findings,
    currentSummary: report.summary,
    implementations: Object.fromEntries(implementationEntries)
  };
};

const main = async (): Promise<void> => {
  const baseline = await readJson<CompatibilityBaseline>("reports/compat/baseline-v0.3.0-m2.json");
  const report = await readJson<HarnessReport>("reports/compat/external-v1.json");
  const result = evaluateCompatibilityGate(baseline, report);
  await mkdir("reports/compat", { recursive: true });
  await Promise.all([
    writeFile("reports/compat/gate-v0.3.0-m2.json", `${JSON.stringify(result, null, 2)}\n`, "utf8"),
    writeFile("reports/compat/gate-v0.3.0-m2.md", renderMarkdown(result), "utf8")
  ]);
  console.log(`compatibility gate ${result.passed ? "passed" : "failed"}: ${JSON.stringify(result.currentSummary)}`);
  if (!result.passed) {
    for (const finding of result.findings) console.error(`- ${finding}`);
    process.exitCode = 1;
  }
};

const readJson = async <T>(path: string): Promise<T> =>
  JSON.parse(await readFile(path, "utf8")) as T;

const renderMarkdown = (result: GateResult): string => [
  "# External Compatibility Gate v0.3.0 M2",
  "",
  `- Generated: ${result.generatedAt}`,
  `- Baseline: ${result.baselineName}`,
  `- Status: ${result.passed ? "passed" : "failed"}`,
  `- Current summary: ${JSON.stringify(result.currentSummary)}`,
  "",
  "| Implementation | Baseline verified | Current verified | Drop |",
  "| --- | ---: | ---: | ---: |",
  ...Object.entries(result.implementations).map(([name, value]) =>
    `| ${name} | ${value.baselineVerified} | ${value.currentVerified} | ${value.verifiedDropPercent.toFixed(2)}% |`
  ),
  "",
  "## Findings",
  "",
  ...(result.findings.length === 0 ? ["- None"] : result.findings.map((finding) => `- ${finding}`)),
  ""
].join("\n");

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(`compatibility gate failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
