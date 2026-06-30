import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  detectReferenceImplementations,
  type BinaryDetection,
  type ReferenceDetectionReport
} from "./reference-detector.js";
import { redactLocalPath } from "./path-redaction.js";
import type { ReferenceImplementation } from "./types.js";

type FingerprintStatus = "fingerprinted" | "not-available" | "failed";
type SourceType = "brew" | "system" | "manual" | "unknown";

interface BinaryFingerprint {
  readonly implementation: ReferenceImplementation;
  readonly binaryName: string;
  readonly status: FingerprintStatus;
  readonly binaryPath: string;
  readonly versionOutput: string;
  readonly sha256?: string;
  readonly fileSize?: number;
  readonly mtime?: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly resolvedSymlinkPath?: string;
  readonly executionTargetPath?: string;
  readonly executionTargetSha256?: string;
  readonly executionTargetFileSize?: number;
  readonly executionTargetMtime?: string;
  readonly sourceType: SourceType;
  readonly trustNote: string;
  readonly error?: string;
}

interface FingerprintReport {
  readonly generatedAt: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly fingerprints: readonly BinaryFingerprint[];
}

export const fingerprintReferences = async (
  detection?: ReferenceDetectionReport
): Promise<FingerprintReport> => {
  const activeDetection = detection ?? await detectReferenceImplementations();
  const fingerprints: BinaryFingerprint[] = [];
  for (const implementation of activeDetection.implementations) {
    for (const binary of implementation.binaries) {
      fingerprints.push(await fingerprintBinary(implementation.implementation, binary));
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    fingerprints
  };
};

export const writeFingerprintReport = async (
  report: FingerprintReport,
  directory = "reports/compat"
): Promise<void> => {
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(`${directory}/reference-fingerprints.json`, `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(`${directory}/reference-fingerprints.md`, renderMarkdown(report), "utf8")
  ]);
};

const fingerprintBinary = async (
  implementation: ReferenceImplementation,
  binary: BinaryDetection
): Promise<BinaryFingerprint> => {
  const base = {
    implementation,
    binaryName: binary.name,
    binaryPath: binary.path === undefined ? "missing" : redactLocalPath(binary.path),
    versionOutput: binary.versionOutput,
    platform: process.platform,
    architecture: process.arch
  };
  if (binary.status !== "available" || binary.path === undefined) {
    return {
      ...base,
      status: "not-available",
      sourceType: "unknown",
      trustNote: `No digest computed because detection status is ${binary.status}.`
    };
  }
  try {
    const resolvedPath = await realpath(binary.path);
    const info = await stat(resolvedPath);
    const executionTarget = await resolveExecutionTarget(resolvedPath, info.size);
    const executionInfo = await stat(executionTarget);
    const entrySha256 = await sha256File(resolvedPath);
    const executionTargetSha256 = executionTarget === resolvedPath
      ? entrySha256
      : await sha256File(executionTarget);
    return {
      ...base,
      status: "fingerprinted",
      sha256: entrySha256,
      fileSize: info.size,
      mtime: info.mtime.toISOString(),
      resolvedSymlinkPath: redactLocalPath(resolvedPath),
      executionTargetPath: redactLocalPath(executionTarget),
      executionTargetSha256,
      executionTargetFileSize: executionInfo.size,
      executionTargetMtime: executionInfo.mtime.toISOString(),
      sourceType: classifySource(binary.path, resolvedPath),
      trustNote: `${trustNote(classifySource(binary.path, resolvedPath))}${executionTarget === resolvedPath
        ? ""
        : " The detected entry is a wrapper; the separately fingerprinted execution target is the payload."}`
    };
  } catch (error) {
    return {
      ...base,
      status: "failed",
      sourceType: "unknown",
      trustNote: "Fingerprint failed; this binary is not eligible for pinned compatibility evidence.",
      error: error instanceof Error ? error.message : String(error)
    };
  }
};

const resolveExecutionTarget = async (resolvedPath: string, size: number): Promise<string> => {
  if (size > 64 * 1024) return resolvedPath;
  try {
    const content = await readFile(resolvedPath, "utf8");
    if (!content.startsWith("#!")) return resolvedPath;
    const match = /\bexec\s+"([^"]+)"/u.exec(content);
    const target = match?.[1];
    return target === undefined || !target.startsWith("/") ? resolvedPath : await realpath(target);
  } catch {
    return resolvedPath;
  }
};

const sha256File = async (path: string): Promise<string> =>
  await new Promise<string>((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("data", (chunk) => {
      hash.update(chunk);
    });
    stream.once("error", reject);
    stream.once("end", () => {
      resolveHash(hash.digest("hex"));
    });
  });

const classifySource = (path: string, resolvedPath: string): SourceType => {
  if (path.includes("/homebrew/") || resolvedPath.includes("/Cellar/")) return "brew";
  if (path.startsWith("/usr/bin/") || path.startsWith("/bin/")) return "system";
  const home = process.env.HOME;
  if (home !== undefined && path.startsWith(`${home}/`)) return "manual";
  return "unknown";
};

const trustNote = (source: SourceType): string => {
  if (source === "brew") return "Local Homebrew installation; formula provenance and bottle checksum require separate review.";
  if (source === "system") return "Operating-system managed binary; verify the host update and signing policy.";
  if (source === "manual") return "Manually installed binary; retain upstream release URL and published checksum.";
  return "Installation source is unknown; do not promote this fingerprint without provenance review.";
};

const renderMarkdown = (report: FingerprintReport): string => [
  "# External Reference Fingerprints",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Platform: ${report.platform}`,
  `- Architecture: ${report.architecture}`,
  "- Paths are local-only redacted representations; binaries are not embedded.",
  "",
  "| Implementation | Binary | Status | Version | Entry SHA-256 | Entry bytes | Path | Execution target | Target SHA-256 | Target bytes | Source | Trust note |",
  "| --- | --- | --- | --- | --- | ---: | --- | --- | --- | ---: | --- | --- |",
  ...report.fingerprints.map((item) =>
    `| ${item.implementation} | ${item.binaryName} | ${item.status} | ${escapeCell(item.versionOutput || "n/a")} | ${item.sha256 ?? "n/a"} | ${item.fileSize ?? 0} | \`${item.binaryPath}\` | \`${item.executionTargetPath ?? "n/a"}\` | ${item.executionTargetSha256 ?? "n/a"} | ${item.executionTargetFileSize ?? 0} | ${item.sourceType} | ${escapeCell(item.trustNote)} |`
  ),
  "",
  "A fingerprint identifies the local file used by a run; it does not by itself establish upstream trust.",
  ""
].join("\n");

const escapeCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ");

const main = async (): Promise<void> => {
  const report = await fingerprintReferences();
  await writeFingerprintReport(report);
  const count = report.fingerprints.filter((item) => item.status === "fingerprinted").length;
  console.log(`reference fingerprints written: ${count} fingerprinted`);
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(`reference fingerprinting failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
