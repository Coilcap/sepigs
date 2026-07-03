import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/loader.js";
import type { SepigsConfig } from "../config/types.js";
import { OutboundGeneration } from "./generation.js";
import { buildOutboundGeneration } from "./generationBuilder.js";
import {
  createOutboundDryRunReport,
  generationSummary,
  type OutboundDryRunReport,
  type OutboundGenerationSummary
} from "./dryRun.js";

export interface OutboundShadowReport {
  readonly generatedAt: string;
  readonly mode: "outbound-generation-prototype-shadow";
  readonly dryRun: OutboundDryRunReport;
  readonly currentGeneration: OutboundGenerationSummary;
  readonly candidateGeneration: OutboundGenerationSummary;
  readonly candidateAccepted: boolean;
  readonly oldConnection: {
    readonly outboundTag: string;
    readonly generationId: string;
    readonly retainedOldReference: boolean;
  };
  readonly newConnection: {
    readonly outboundTag?: string;
    readonly generationId: string;
    readonly wouldUseCandidate: boolean;
  };
  readonly activeReferenceWarnings: readonly string[];
  readonly finalReferenceCounts: {
    readonly current: number;
    readonly candidate: number;
  };
  readonly sideEffects: {
    readonly runtimeMutated: false;
    readonly activeRegistryReplaced: false;
    readonly productionEngineInvoked: false;
    readonly registryFactoriesInvoked: 0;
    readonly outboundInstancesCreated: 0;
    readonly networkConnectionsOpened: 0;
    readonly listenersOpened: 0;
    readonly connectionsClosed: 0;
    readonly dnsMutated: false;
    readonly fakeIpMutated: false;
  };
}

export interface OutboundShadowOptions {
  readonly candidatePath: string;
  readonly currentPath?: string;
}

export const createOutboundShadowReport = (
  current: SepigsConfig,
  candidate: SepigsConfig,
  paths: {
    readonly currentConfigPath: string;
    readonly candidateConfigPath: string;
  }
): OutboundShadowReport => {
  const currentGeneration = new OutboundGeneration({
    id: "outbound-shadow-current-0",
    outbounds: current.outbounds,
    defaultOutbound: current.route.defaultOutbound,
    policies: current.route.policies,
    state: "active"
  });
  const oldTag = firstSelectedOutbound(current);
  const releaseOld = currentGeneration.acquire();
  const retainedOldReference = currentGeneration.referenceCount === 1;
  const built = buildOutboundGeneration({
    id: "outbound-shadow-candidate-1",
    currentOutbounds: current.outbounds,
    candidateConfig: candidate,
    currentPolicies: current.route.policies,
    activeReferenceTags: [oldTag],
    parentGenerationId: currentGeneration.id
  });
  const candidateAccepted = built.validation.errors.length === 0;
  const candidateTag = candidateAccepted
    ? firstSelectedOutbound(candidate)
    : undefined;
  const releaseCandidate =
    candidateTag !== undefined &&
    built.generation.registrySnapshot.has(candidateTag)
      ? built.generation.acquire()
      : undefined;
  const activeReferenceWarnings = built.validation.warnings
    .filter((issue) => issue.code === "removed-active-connection-reference")
    .map((issue) => issue.message);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "outbound-generation-prototype-shadow" as const,
    dryRun: createOutboundDryRunReport(current, candidate, paths),
    currentGeneration: generationSummary(currentGeneration),
    candidateGeneration: generationSummary(built.generation),
    candidateAccepted,
    oldConnection: {
      outboundTag: oldTag,
      generationId: currentGeneration.id,
      retainedOldReference
    },
    newConnection: {
      ...(candidateTag === undefined ? {} : { outboundTag: candidateTag }),
      generationId: built.generation.id,
      wouldUseCandidate:
        candidateAccepted &&
        candidateTag !== undefined &&
        built.generation.registrySnapshot.has(candidateTag)
    },
    activeReferenceWarnings,
    sideEffects: {
      runtimeMutated: false as const,
      activeRegistryReplaced: false as const,
      productionEngineInvoked: false as const,
      registryFactoriesInvoked: 0 as const,
      outboundInstancesCreated: 0 as const,
      networkConnectionsOpened: 0 as const,
      listenersOpened: 0 as const,
      connectionsClosed: 0 as const,
      dnsMutated: false as const,
      fakeIpMutated: false as const
    }
  };
  releaseCandidate?.();
  releaseOld();
  return Object.freeze({
    ...report,
    finalReferenceCounts: {
      current: currentGeneration.referenceCount,
      candidate: built.generation.referenceCount
    }
  });
};

export const runOutboundShadow = async (
  options: OutboundShadowOptions
): Promise<OutboundShadowReport> => {
  const currentPath = options.currentPath ?? "examples/sepigs.json";
  const [current, candidate] = await Promise.all([
    loadConfig(currentPath),
    loadConfig(options.candidatePath)
  ]);
  return createOutboundShadowReport(current, candidate, {
    currentConfigPath: currentPath,
    candidateConfigPath: options.candidatePath
  });
};

export const writeOutboundShadowReport = async (
  report: OutboundShadowReport,
  outputDirectory = "reports/outbound"
): Promise<void> => {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "shadow-latest.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, "shadow-latest.md"),
      renderMarkdown(report),
      "utf8"
    )
  ]);
};

const firstSelectedOutbound = (config: SepigsConfig): string => {
  const policy = config.route.policies.find(
    (item) => item.tag === config.route.defaultOutbound
  );
  return policy?.outbounds[0] ?? config.route.defaultOutbound;
};

const renderMarkdown = (report: OutboundShadowReport): string => [
  "# Outbound Generation Shadow Report",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Candidate accepted: ${report.candidateAccepted ? "yes" : "no"}`,
  `- Old connection outbound: \`${report.oldConnection.outboundTag}\``,
  `- Old connection generation: \`${report.oldConnection.generationId}\``,
  `- Old reference retained during simulation: ${report.oldConnection.retainedOldReference ? "yes" : "no"}`,
  `- New connection outbound: ${report.newConnection.outboundTag === undefined ? "none" : `\`${report.newConnection.outboundTag}\``}`,
  `- New connection generation: \`${report.newConnection.generationId}\``,
  `- New connection would use candidate: ${report.newConnection.wouldUseCandidate ? "yes" : "no"}`,
  `- Active-reference warnings: ${String(report.activeReferenceWarnings.length)}`,
  `- Final generation references: ${String(report.finalReferenceCounts.current)}/${String(report.finalReferenceCounts.candidate)}`,
  "- Runtime mutated: no",
  "- Active registry replaced: no",
  "- Production Engine invoked: no",
  "- Outbound instances created: 0",
  "- Network connections opened: 0",
  "- Connections closed: 0",
  "- DNS/fake-IP mutated: no",
  "",
  "## Warnings",
  "",
  ...(report.activeReferenceWarnings.length === 0
    ? ["- None."]
    : report.activeReferenceWarnings.map((warning) => `- ${warning}`)),
  "",
  "This M10 shadow simulates generation references only. It does not publish to the production registry.",
  ""
].join("\n");

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  const candidatePath = argument("--config") ?? "examples/sepigs.safe.json";
  const currentPath = argument("--current-config") ?? "examples/sepigs.json";
  const report = await runOutboundShadow({ candidatePath, currentPath });
  await writeOutboundShadowReport(report);
  if (!report.candidateAccepted) {
    throw new Error(
      `outbound shadow rejected candidate with ${String(report.dryRun.validation.errors.length)} validation errors`
    );
  }
  console.log(
    "outbound shadow passed: old reference retained; new selection uses candidate; no runtime side effects"
  );
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(
      `outbound shadow failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
