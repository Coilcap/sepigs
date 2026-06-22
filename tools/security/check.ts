import { readFile, readdir } from "node:fs/promises";
import { extname, join } from "node:path";
import YAML from "yaml";
import { parseConfig } from "../../src/config/schema.js";
import { parseSubscription } from "../../src/subscription/parser.js";
import { redactSubscriptionOutbounds } from "../../src/subscription/redact.js";

const findings: string[] = [];
const files = await walk(["docs", "examples", "verification/manual-pack"]);
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

if (findings.length > 0) { console.error(["security check failed", ...findings.map((item) => `- ${item}`)].join("\n")); process.exitCode = 1; }
else console.log(`security check passed: ${files.length} documentation/example files scanned`);

function hasAuth(inbound: ReturnType<typeof parseConfig>["inbounds"][number]): boolean { return (inbound.type === "http" || inbound.type === "socks5") ? inbound.auth?.enabled === true : inbound.type === "shadowsocks" || inbound.type === "trojan"; }
async function walk(roots: readonly string[]): Promise<readonly string[]> { const output: string[] = []; const visit = async (path: string): Promise<void> => { for (const entry of await readdir(path, { withFileTypes: true })) { const child = join(path, entry.name); if (entry.isDirectory()) await visit(child); else if (entry.isFile() && /\.(md|json|ya?ml|conf|txt)$/u.test(child)) output.push(child); } }; for (const root of roots) await visit(root); return output; }
