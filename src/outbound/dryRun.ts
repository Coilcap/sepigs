import { mkdir, writeFile } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/loader.js";
import type {
  OutboundConfig,
  SepigsConfig
} from "../config/types.js";
import { OutboundGeneration } from "./generation.js";
import { buildOutboundGeneration } from "./generationBuilder.js";
import type {
  OutboundGenerationBuildResult,
  OutboundGenerationDescriptor,
  OutboundRiskLevel
} from "./generationTypes.js";

export interface OutboundGenerationSummary {
  readonly id: string;
  readonly configHash: string;
  readonly state: OutboundGenerationDescriptor["state"];
  readonly parentGenerationId: string | undefined;
  readonly entryCount: number;
  readonly referenceCount: number;
  readonly entries: readonly {
    readonly tag: string;
    readonly type: OutboundConfig["type"];
    readonly configHash: string;
    readonly riskLevel: OutboundRiskLevel;
    readonly experimental: boolean;
    readonly capabilities: {
      readonly tcp: boolean;
      readonly udp: boolean;
      readonly stateless: boolean;
    };
    readonly dependencies: readonly string[];
  }[];
}

export interface OutboundDryRunReport {
  readonly generatedAt: string;
  readonly mode: "outbound-generation-prototype-dry-run";
  readonly currentConfigPath: string;
  readonly candidateConfigPath: string;
  readonly currentGeneration: OutboundGenerationSummary;
  readonly candidateGeneration: OutboundGenerationSummary;
  readonly diff: OutboundGenerationBuildResult["diff"];
  readonly validation: OutboundGenerationBuildResult["validation"];
  readonly m11RuntimeAssessment: {
    readonly allowed: boolean;
    readonly reason: string;
  };
  readonly secretRedaction: {
    readonly status: "passed" | "failed";
    readonly checkedSecretFields: number;
    readonly leakedValues: 0;
    readonly changedSecretsRenderedAs: "[REDACTED]";
  };
  readonly sideEffects: {
    readonly runtimeMutated: false;
    readonly registryFactoriesInvoked: 0;
    readonly outboundInstancesCreated: 0;
    readonly networkConnectionsOpened: 0;
    readonly listenersOpened: 0;
    readonly connectionsClosed: 0;
  };
}

export const createOutboundDryRunReport = (
  current: SepigsConfig,
  candidate: SepigsConfig,
  paths: {
    readonly currentConfigPath: string;
    readonly candidateConfigPath: string;
  }
): OutboundDryRunReport => {
  const currentGeneration = new OutboundGeneration({
    id: "outbound-current-0",
    outbounds: current.outbounds,
    defaultOutbound: current.route.defaultOutbound,
    policies: current.route.policies,
    state: "active"
  });
  const built = buildOutboundGeneration({
    id: "outbound-candidate-1",
    currentOutbounds: current.outbounds,
    candidateConfig: candidate,
    currentPolicies: current.route.policies,
    parentGenerationId: currentGeneration.id
  });
  const m11Allowed =
    built.validation.errors.length === 0 &&
    built.validation.unsupportedChanges.length === 0 &&
    [...built.generation.registrySnapshot.values()].every(
      (entry) => entry.riskLevel === "low"
    );
  const reportWithoutProof = {
    generatedAt: new Date().toISOString(),
    mode: "outbound-generation-prototype-dry-run" as const,
    currentConfigPath: safeReportPath(paths.currentConfigPath),
    candidateConfigPath: safeReportPath(paths.candidateConfigPath),
    currentGeneration: generationSummary(currentGeneration),
    candidateGeneration: generationSummary(built.generation),
    diff: built.diff,
    validation: built.validation,
    m11RuntimeAssessment: {
      allowed: m11Allowed,
      reason: m11Allowed
        ? "candidate contains only validated direct/block/tcpRelay entries"
        : "candidate has validation errors, unsupported changes, or medium/high-risk entries"
    },
    sideEffects: {
      runtimeMutated: false as const,
      registryFactoriesInvoked: 0 as const,
      outboundInstancesCreated: 0 as const,
      networkConnectionsOpened: 0 as const,
      listenersOpened: 0 as const,
      connectionsClosed: 0 as const
    }
  };
  const secrets = collectSecretValues([...current.outbounds, ...candidate.outbounds]);
  const serialized = JSON.stringify(reportWithoutProof);
  const leaked = secrets.filter((secret) =>
    serialized.includes(JSON.stringify(secret))
  );
  if (leaked.length > 0) {
    throw new Error("outbound dry-run report secret redaction failed");
  }
  return Object.freeze({
    ...reportWithoutProof,
    secretRedaction: {
      status: "passed" as const,
      checkedSecretFields: secrets.length,
      leakedValues: 0 as const,
      changedSecretsRenderedAs: "[REDACTED]" as const
    }
  });
};

export const loadOutboundDryRunReport = async (
  candidatePath: string,
  currentPath = "examples/sepigs.json"
): Promise<OutboundDryRunReport> => {
  const [current, candidate] = await Promise.all([
    loadConfig(currentPath),
    loadConfig(candidatePath)
  ]);
  return createOutboundDryRunReport(current, candidate, {
    currentConfigPath: currentPath,
    candidateConfigPath: candidatePath
  });
};

export const writeOutboundDryRunReport = async (
  report: OutboundDryRunReport,
  outputDirectory = "reports/outbound"
): Promise<void> => {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "dry-run-latest.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, "dry-run-latest.md"),
      renderMarkdown(report),
      "utf8"
    )
  ]);
};

export const generationSummary = (
  generation: OutboundGenerationDescriptor
): OutboundGenerationSummary => ({
  id: generation.id,
  configHash: generation.configHash,
  state: generation.state,
  parentGenerationId: generation.parentGenerationId,
  entryCount: generation.registrySnapshot.size,
  referenceCount: generation.referenceCount,
  entries: [...generation.registrySnapshot.values()].map((entry) => ({
    tag: entry.tag,
    type: entry.type,
    configHash: entry.configHash,
    riskLevel: entry.riskLevel,
    experimental: entry.experimental,
    capabilities: entry.capabilities,
    dependencies: entry.dependencies
  }))
});

const renderMarkdown = (report: OutboundDryRunReport): string => [
  "# Outbound Generation Dry-Run",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Current config: \`${report.currentConfigPath}\``,
  `- Candidate config: \`${report.candidateConfigPath}\``,
  `- Current generation: \`${report.currentGeneration.id}\` (${String(report.currentGeneration.entryCount)} entries)`,
  `- Candidate generation: \`${report.candidateGeneration.id}\` (${String(report.candidateGeneration.entryCount)} entries)`,
  `- Validation errors: ${String(report.validation.errors.length)}`,
  `- Validation warnings: ${String(report.validation.warnings.length)}`,
  `- Highest risk: ${report.validation.riskSummary.highest}`,
  `- Runtime restart required: ${report.validation.requiresRuntimeRestart ? "yes" : "no"}`,
  `- M11 limited runtime would allow: ${report.m11RuntimeAssessment.allowed ? "yes" : "no"}`,
  `- Secret redaction: ${report.secretRedaction.status}; ${String(report.secretRedaction.checkedSecretFields)} values checked`,
  "- Runtime mutated: no",
  "- Outbound instances created: 0",
  "- Network connections opened: 0",
  "",
  "## Diff",
  "",
  `- Added: ${list(report.diff.added)}`,
  `- Removed: ${list(report.diff.removed)}`,
  `- Renamed: ${report.diff.renamed.length === 0 ? "none" : report.diff.renamed.map((item) => `${item.from} -> ${item.to}`).join(", ")}`,
  `- Modified: ${report.diff.modified.length === 0 ? "none" : report.diff.modified.map((item) => `${item.tag} (${item.changedFields.join(", ")})`).join("; ")}`,
  `- Type changed: ${list(report.diff.typeChanged)}`,
  `- Target changed: ${list(report.diff.targetChanged)}`,
  `- Secret changed: ${report.diff.secretChanged.length === 0 ? "none" : report.diff.secretChanged.map((tag) => `${tag} ([REDACTED])`).join(", ")}`,
  `- Missing policy references: ${list(report.diff.missingPolicyReferences)}`,
  "",
  "## Validation",
  "",
  ...issueLines("Error", report.validation.errors),
  ...issueLines("Warning", report.validation.warnings),
  ...(report.validation.errors.length === 0 && report.validation.warnings.length === 0
    ? ["- No validation findings."]
    : []),
  "",
  "This M10 report is a pure-data prototype. It does not invoke the production registry, create an outbound, or connect to a target.",
  ""
].join("\n");

const issueLines = (
  label: string,
  issues: OutboundDryRunReport["validation"]["errors"]
): readonly string[] =>
  issues.map((issue) => `- ${label} \`${issue.code}\`: ${issue.message}`);

const list = (items: readonly string[]): string =>
  items.length === 0 ? "none" : items.join(", ");

const safeReportPath = (path: string): string => {
  if (!isAbsolute(path)) return path;
  const local = relative(process.cwd(), path);
  return local.length > 0 && !local.startsWith("..") ? local : "<external-config>";
};

const collectSecretValues = (
  outbounds: readonly OutboundConfig[]
): readonly string[] => {
  const values: string[] = [];
  const visit = (value: unknown, key = ""): void => {
    if (Array.isArray(value)) {
      for (const child of value) visit(child);
      return;
    }
    if (typeof value !== "object" || value === null) {
      if (
        typeof value === "string" &&
        value.length > 0 &&
        /password|token|secret|privatekey|presharedkey/iu.test(key)
      ) {
        values.push(value);
      }
      return;
    }
    for (const [childKey, child] of Object.entries(value)) {
      visit(child, childKey);
    }
  };
  for (const outbound of outbounds) visit(outbound);
  return [...new Set(values)];
};

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  const candidatePath = argument("--config") ?? "examples/sepigs.safe.json";
  const currentPath =
    argument("--current-config") ??
    process.env.SEPIGS_CURRENT_CONFIG ??
    "examples/sepigs.json";
  const report = await loadOutboundDryRunReport(candidatePath, currentPath);
  await writeOutboundDryRunReport(report);
  if (report.validation.errors.length > 0) {
    throw new Error(
      `outbound dry-run found ${String(report.validation.errors.length)} validation errors`
    );
  }
  console.log(
    `outbound dry-run passed: ${String(report.candidateGeneration.entryCount)} entries; ${report.validation.riskSummary.highest} risk; no runtime side effects`
  );
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(
      `outbound dry-run failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
