import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createCompatSubdirectory, createCompatTempDirectory } from "./temp.js";

const PACK_NAME = "sepigs-v0.3.0-m2-compat-evidence";
const OUTPUT_PATH = `artifacts/${PACK_NAME}.zip`;
const SOURCE_FILES = [
  "reports/compat/reference-detection.json",
  "reports/compat/reference-detection.md",
  "reports/compat/reference-fingerprints.json",
  "reports/compat/reference-fingerprints.md",
  "reports/compat/sing-box-v0.3.0-m2.json",
  "reports/compat/sing-box-v0.3.0-m2.md",
  "reports/compat/xray-v0.3.0-m2.json",
  "reports/compat/xray-v0.3.0-m2.md",
  "reports/compat/external-v1.json",
  "reports/compat/external-v1.md",
  "reports/compat/external-summary-v1.json",
  "reports/compat/external-summary-v1.md",
  "reports/compat/baseline-v0.3.0-m2.json",
  "reports/compat/gate-v0.3.0-m2.json",
  "reports/compat/gate-v0.3.0-m2.md"
] as const;

interface ManifestEntry {
  readonly path: string;
  readonly bytes: number;
  readonly sha256: string;
}

export const auditEvidenceText = (path: string, text: string): readonly string[] => {
  const findings: string[] = [];
  if (/\/Users\/[A-Za-z0-9._-]+\//u.test(text)) findings.push(`user absolute path in ${path}`);
  if (/\/(?:private\/var|var\/folders)\//u.test(text)) findings.push(`temporary absolute path in ${path}`);
  if (/\/(?:opt\/homebrew|usr\/local)\//u.test(text)) findings.push(`local installation path in ${path}`);
  if (/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/u.test(text)) findings.push(`private key material in ${path}`);
  if (/sepigs-test-only-(?:wrong-)?password/u.test(text)) findings.push(`unredacted test secret in ${path}`);
  if (/"(?:password|token|privateKey)"\s*:\s*"(?!\[REDACTED)/u.test(text)) {
    findings.push(`credential-shaped value in ${path}`);
  }
  return findings;
};

const main = async (): Promise<void> => {
  const temp = await createCompatTempDirectory("evidence-pack");
  try {
    const packRoot = await createCompatSubdirectory(temp.path, PACK_NAME);
    const manifest: ManifestEntry[] = [];
    const findings: string[] = [];
    for (const source of SOURCE_FILES) {
      const info = await stat(source);
      if (!info.isFile()) {
        findings.push(`not a regular file: ${source}`);
        continue;
      }
      if (info.size > 5 * 1024 * 1024) findings.push(`file exceeds 5 MiB: ${source}`);
      const text = await readFile(source, "utf8");
      findings.push(...auditEvidenceText(source, text));
      const destination = join(packRoot, basename(source));
      await cp(source, destination);
      manifest.push({
        path: basename(source),
        bytes: info.size,
        sha256: createHash("sha256").update(text).digest("hex")
      });
    }
    const reproduction = reproductionGuide();
    findings.push(...auditEvidenceText("REPRODUCTION.md", reproduction));
    await writeFile(join(packRoot, "REPRODUCTION.md"), reproduction, { encoding: "utf8", mode: 0o600 });
    manifest.push({
      path: "REPRODUCTION.md",
      bytes: Buffer.byteLength(reproduction),
      sha256: createHash("sha256").update(reproduction).digest("hex")
    });
    if (findings.length > 0) {
      throw new Error(["evidence pack audit failed", ...findings.map((finding) => `- ${finding}`)].join("\n"));
    }
    await writeFile(join(packRoot, "MANIFEST.json"), `${JSON.stringify({
      schemaVersion: 1,
      pack: PACK_NAME,
      generatedAt: new Date().toISOString(),
      includesBinaries: false,
      entries: manifest
    }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
    await mkdir("artifacts", { recursive: true });
    await rm(OUTPUT_PATH, { force: true });
    await runZip(resolve(OUTPUT_PATH), PACK_NAME, temp.path);
    console.log(`compatibility evidence pack created: ${OUTPUT_PATH}`);
  } finally {
    await temp.cleanup();
  }
};

const reproductionGuide = (): string => [
  "# Compatibility Evidence Reproduction",
  "",
  "Run from a clean sepigs checkout with the pinned reference binaries on PATH:",
  "",
  "```bash",
  "npm ci",
  "npm run compat:detect",
  "npm run compat:fingerprint",
  "npm run compat:external:v1",
  "npm run compat:report",
  "npm run compat:gate",
  "npm run compat:evidence-pack",
  "```",
  "",
  "Reproduce one case:",
  "",
  "```bash",
  "npm run compat:external:v1 -- --case <case-id>",
  "```",
  "",
  "Compare the detected version and SHA-256 before comparing results across hosts.",
  ""
].join("\n");

const runZip = async (outputPath: string, directory: string, cwd: string): Promise<void> => {
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn("zip", ["-qr", outputPath, directory], {
      cwd,
      stdio: ["ignore", "ignore", "pipe"]
    });
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer | string) => {
      stderr = `${stderr}${Buffer.isBuffer(chunk) ? chunk.toString("utf8") : chunk}`.slice(0, 4_096);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`zip exited with code ${String(code)}: ${stderr.trim()}`));
    });
  });
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
