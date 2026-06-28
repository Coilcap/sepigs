import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { delimiter, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { ReferenceImplementation } from "./types.js";

export type DetectionStatus = "available" | "partial" | "missing" | "failed-version-check";

export interface BinaryDetection {
  readonly name: string;
  readonly status: "available" | "missing" | "not-executable" | "failed-version-check";
  readonly path?: string;
  readonly executable: boolean;
  readonly versionCommand: readonly string[];
  readonly versionOutput: string;
  readonly error?: string;
}

export interface ReferenceDetection {
  readonly implementation: ReferenceImplementation;
  readonly status: DetectionStatus;
  readonly binaries: readonly BinaryDetection[];
  readonly installHint: string;
}

export interface ReferenceDetectionReport {
  readonly generatedAt: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly implementations: readonly ReferenceDetection[];
}

interface BinaryDefinition {
  readonly name: string;
  readonly versionArgs: readonly string[];
  readonly fallbackVersionArgs?: readonly string[];
}

interface ReferenceDefinition {
  readonly implementation: ReferenceImplementation;
  readonly binaries: readonly BinaryDefinition[];
  readonly installHint: string;
}

const DEFINITIONS: readonly ReferenceDefinition[] = [
  {
    implementation: "shadowsocks-rust",
    binaries: [
      { name: "ssserver", versionArgs: ["--version"] },
      { name: "sslocal", versionArgs: ["--version"] }
    ],
    installHint: "cargo install shadowsocks-rust --version 1.24.0"
  },
  {
    implementation: "shadowsocks-libev",
    binaries: [
      { name: "ss-server", versionArgs: ["-h"] },
      { name: "ss-local", versionArgs: ["-h"] }
    ],
    installHint: "brew install shadowsocks-libev"
  },
  {
    implementation: "sing-box",
    binaries: [{ name: "sing-box", versionArgs: ["version"] }],
    installHint: "brew install sing-box"
  },
  {
    implementation: "xray",
    binaries: [{ name: "xray", versionArgs: ["version"] }],
    installHint: "brew install xray"
  },
  {
    implementation: "trojan-go",
    binaries: [{ name: "trojan-go", versionArgs: ["-version"], fallbackVersionArgs: ["--version"] }],
    installHint: "go install github.com/p4gefau1t/trojan-go@v0.10.6"
  }
];

export const detectReferenceImplementations = async (): Promise<ReferenceDetectionReport> => {
  const implementations: ReferenceDetection[] = [];
  for (const definition of DEFINITIONS) {
    const binaries: BinaryDetection[] = [];
    for (const binary of definition.binaries) {
      binaries.push(await detectBinary(binary));
    }
    implementations.push({
      implementation: definition.implementation,
      status: aggregateStatus(binaries),
      binaries,
      installHint: definition.installHint
    });
  }
  return {
    generatedAt: new Date().toISOString(),
    platform: process.platform,
    architecture: process.arch,
    implementations
  };
};

export const writeReferenceDetectionReport = async (
  report: ReferenceDetectionReport,
  directory = "reports/compat"
): Promise<void> => {
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(join(directory, "reference-detection.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile(join(directory, "reference-detection.md"), renderMarkdown(report), "utf8")
  ]);
};

export const findDetectedBinary = (
  report: ReferenceDetectionReport,
  implementation: ReferenceImplementation,
  binaryName: string
): BinaryDetection | undefined =>
  report.implementations
    .find((item) => item.implementation === implementation)
    ?.binaries.find((item) => item.name === binaryName);

const detectBinary = async (definition: BinaryDefinition): Promise<BinaryDetection> => {
  const path = await findOnPath(definition.name);
  if (path === undefined) {
    return {
      name: definition.name,
      status: "missing",
      executable: false,
      versionCommand: [definition.name, ...definition.versionArgs],
      versionOutput: ""
    };
  }
  try {
    await access(path, constants.X_OK);
  } catch (error) {
    return {
      name: definition.name,
      status: "not-executable",
      path,
      executable: false,
      versionCommand: [path, ...definition.versionArgs],
      versionOutput: "",
      error: error instanceof Error ? error.message : String(error)
    };
  }
  const primary = await runVersion(path, definition.versionArgs);
  const version = primary.ok || definition.fallbackVersionArgs === undefined
    ? primary
    : await runVersion(path, definition.fallbackVersionArgs);
  return {
    name: definition.name,
    status: version.ok ? "available" : "failed-version-check",
    path,
    executable: true,
    versionCommand: [path, ...(version.args ?? definition.versionArgs)],
    versionOutput: version.output,
    ...(version.ok ? {} : { error: version.error })
  };
};

const runVersion = async (
  command: string,
  args: readonly string[]
): Promise<{ readonly ok: boolean; readonly output: string; readonly error?: string; readonly args?: readonly string[] }> =>
  await new Promise((resolve) => {
    const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    let settled = false;
    const finish = (result: { readonly ok: boolean; readonly error?: string }): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const normalized = output.replaceAll(/\s+/gu, " ").trim().slice(0, 2_000);
      resolve({
        ok: result.ok,
        output: normalized,
        args,
        ...(result.error === undefined ? {} : { error: result.error })
      });
    };
    child.stdout.on("data", (chunk: Buffer | string) => {
      output = appendBounded(output, chunk, 4_000);
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      output = appendBounded(output, chunk, 4_000);
    });
    child.once("error", (error) => {
      finish({ ok: false, error: error.message });
    });
    child.once("exit", (code, signal) => {
      finish({
        ok: code === 0 && output.trim().length > 0,
        ...(code === 0 && output.trim().length > 0
          ? {}
          : { error: `version command exited with code ${String(code)} signal ${String(signal)}` })
      });
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ ok: false, error: "version command timed out after 3000ms" });
    }, 3_000);
  });

const findOnPath = async (name: string): Promise<string | undefined> => {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (directory.length === 0) continue;
    const path = join(directory, name);
    try {
      await access(path);
      return path;
    } catch {
      // Keep searching.
    }
  }
  return undefined;
};

const aggregateStatus = (binaries: readonly BinaryDetection[]): DetectionStatus => {
  if (binaries.every((item) => item.status === "missing")) return "missing";
  if (binaries.some((item) => item.status === "failed-version-check" || item.status === "not-executable")) {
    return "failed-version-check";
  }
  if (binaries.every((item) => item.status === "available")) return "available";
  return "partial";
};

const appendBounded = (current: string, value: Buffer | string, limit: number): string => {
  if (current.length >= limit) return current;
  return `${current}${Buffer.isBuffer(value) ? value.toString("utf8") : value}`.slice(0, limit);
};

const renderMarkdown = (report: ReferenceDetectionReport): string => [
  "# External Reference Detection",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Platform: ${report.platform}`,
  `- Architecture: ${report.architecture}`,
  "",
  "| Implementation | Status | Binary | Binary status | Version command | Version output | Install hint |",
  "| --- | --- | --- | --- | --- | --- | --- |",
  ...report.implementations.flatMap((item) =>
    item.binaries.map((binary) =>
      `| ${item.implementation} | ${item.status} | ${binary.name} | ${binary.status} | \`${escapeCell(binary.versionCommand.join(" "))}\` | ${escapeCell(binary.versionOutput || binary.error || "n/a")} | \`${escapeCell(item.installHint)}\` |`
    )
  ),
  "",
  "Detection does not imply interoperability verification.",
  ""
].join("\n");

const escapeCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ");

const main = async (): Promise<void> => {
  const report = await detectReferenceImplementations();
  await writeReferenceDetectionReport(report);
  const summary = Object.fromEntries(report.implementations.map((item) => [item.implementation, item.status]));
  console.log(`reference detection written: ${JSON.stringify(summary)}`);
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(`reference detection failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
