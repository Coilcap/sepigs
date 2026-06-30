import { execFile } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { promisify } from "node:util";
import YAML from "yaml";
import { parseConfig } from "../../src/config/schema.js";
import { parseSubscription } from "../../src/subscription/parser.js";
import { redactSubscriptionOutbounds } from "../../src/subscription/redact.js";
import { auditEvidenceText } from "../compat/evidence-pack.js";
import type { ExternalCompatibilityCase } from "../compat/types.js";

const findings: string[] = [];
const files = await walk(["docs", "examples", "verification/manual-pack", "reports/compat"]);
for (const file of files) {
  const text = await readFile(file, "utf8");
  if (/\/Users\/[A-Za-z0-9._-]+\//u.test(text)) findings.push(`local absolute path: ${file}`);
  if (/BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY/u.test(text)) findings.push(`private key material: ${file}`);
  for (const match of text.matchAll(/"(?:password|token)"\s*:\s*"([^"]+)"/gu)) {
    const value = match[1] ?? "";
    if (!["secret", "change-me", "change-me-long-random-password", "replace-with-a-long-token", "[REDACTED]", "..."].includes(value)) findings.push(`non-placeholder credential in ${file}`);
  }
}

for (const file of files.filter((item) => /^examples\/sepigs.*\.(json|ya?ml)$/u.test(item))) {
  const text = await readFile(file, "utf8"); const input = extname(file) === ".json" ? JSON.parse(text) as unknown : YAML.parse(text) as unknown; const config = parseConfig(input);
  if (config.dashboard.enabled) findings.push(`dashboard enabled by default in ${file}`);
  if (config.observability.metrics.listen !== "127.0.0.1") findings.push(`metrics not loopback in ${file}`);
  for (const inbound of config.inbounds) if ((inbound.listen === "0.0.0.0" || inbound.listen === "::") && !hasAuth(inbound)) findings.push(`unauthenticated public inbound in ${file}`);
}

const secret = "phase9-subscription-secret"; const uri = `trojan://${secret}@example.test:443#node`; const dryRun = JSON.stringify(redactSubscriptionOutbounds(parseSubscription(uri).outbounds));
if (dryRun.includes(secret) || !dryRun.includes("[REDACTED]")) findings.push("subscription dry-run redaction failed");

const m2ReportFiles = files.filter((file) =>
  file.startsWith("reports/compat/") && /(?:external-v1|external-summary-v1|reference-(?:detection|fingerprints)|sing-box-v0\.3\.0-m2|xray-v0\.3\.0-m2|gate-v0\.3\.0-m2)/u.test(file)
);
for (const file of m2ReportFiles) {
  findings.push(...auditEvidenceText(file, await readFile(file, "utf8")));
}

if (await exists("reports/compat/external-v1.json")) {
  const report = JSON.parse(await readFile("reports/compat/external-v1.json", "utf8")) as {
    readonly cases?: readonly ExternalCompatibilityCase[];
  };
  for (const item of report.cases ?? []) {
    if (item.stdoutExcerpt.length > 2_000 || item.stderrExcerpt.length > 2_000) {
      findings.push(`unbounded compatibility log excerpt: ${item.caseId}`);
    }
    if (item.result === "verified" && item.processCleanup?.portsReleased !== true) {
      findings.push(`verified case lacks port cleanup evidence: ${item.caseId}`);
    }
  }
}

findings.push(...await auditEvidenceArchive("artifacts/sepigs-v0.3.0-m2-compat-evidence.zip"));

if (findings.length > 0) { console.error(["security check failed", ...findings.map((item) => `- ${item}`)].join("\n")); process.exitCode = 1; }
else console.log(`security check passed: ${files.length} documentation/example files scanned`);

function hasAuth(inbound: ReturnType<typeof parseConfig>["inbounds"][number]): boolean { return (inbound.type === "http" || inbound.type === "socks5") ? inbound.auth?.enabled === true : inbound.type === "shadowsocks" || inbound.type === "trojan"; }
async function walk(roots: readonly string[]): Promise<readonly string[]> { const output: string[] = []; const visit = async (path: string): Promise<void> => { for (const entry of await readdir(path, { withFileTypes: true })) { const child = join(path, entry.name); if (entry.isDirectory()) await visit(child); else if (entry.isFile() && /\.(md|json|ya?ml|conf|txt)$/u.test(child)) output.push(child); } }; for (const root of roots) await visit(root); return output; }

async function auditEvidenceArchive(path: string): Promise<readonly string[]> {
  if (!(await exists(path))) return [];
  const archiveFindings: string[] = [];
  const execFileAsync = promisify(execFile);
  const listing = await execFileAsync("unzip", ["-Z1", path], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  const entries = listing.stdout.split("\n").filter((entry) => entry.length > 0 && !entry.endsWith("/"));
  for (const entry of entries) {
    if (/node_modules|(?:^|\/)(?:bin|libexec)\/|temp-config|private[-_.]?key/iu.test(entry)) {
      archiveFindings.push(`forbidden evidence archive entry: ${entry}`);
      continue;
    }
    if (!/\.(?:json|md)$/u.test(entry)) {
      archiveFindings.push(`non-text evidence archive entry: ${entry}`);
      continue;
    }
    const extracted = await execFileAsync("unzip", ["-p", path, entry], {
      encoding: "utf8",
      maxBuffer: 8 * 1024 * 1024
    });
    archiveFindings.push(...auditEvidenceText(entry, extracted.stdout));
  }
  return archiveFindings;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
