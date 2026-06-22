import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";
import YAML from "yaml";
import { parseConfig } from "../../src/config/schema.js";

interface PackageJson {
  readonly scripts?: Readonly<Record<string, string>>;
}

const failures: string[] = [];
const packageJson = JSON.parse(await readFile("package.json", "utf8")) as PackageJson;
const scripts = new Set(Object.keys(packageJson.scripts ?? {}));
const files = await listFiles(".");
const docFiles = files.filter((file) => isDocFile(file));

checkRequiredFiles(files);
await checkNpmScripts(docFiles, scripts);
await checkMarkdownLinks(docFiles);
await checkExampleConfigs(files);

if (failures.length > 0) {
  console.error(["docs check failed:", ...failures.map((failure) => `- ${failure}`)].join("\n"));
  process.exitCode = 1;
} else {
  console.log(`docs check passed: ${docFiles.length} markdown files scanned`);
}

async function checkNpmScripts(markdownFiles: readonly string[], knownScripts: ReadonlySet<string>): Promise<void> {
  for (const file of markdownFiles) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/\bnpm run ([a-zA-Z0-9:._-]+)/gu)) {
      const script = match[1];
      if (script !== undefined && !knownScripts.has(script)) {
        failures.push(`${file} references missing npm script "${script}"`);
      }
    }
  }
}

async function checkMarkdownLinks(markdownFiles: readonly string[]): Promise<void> {
  const allFiles = new Set(files.map((file) => normalize(file)));
  for (const file of markdownFiles) {
    const text = await readFile(file, "utf8");
    for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)) {
      const rawLink = match[1];
      if (rawLink === undefined || shouldSkipLink(rawLink)) {
        continue;
      }
      const linkPath = rawLink.split("#")[0] ?? rawLink;
      if (linkPath.length === 0) {
        continue;
      }
      const target = normalize(join(dirname(file), decodeURIComponent(linkPath)));
      if (!allFiles.has(target)) {
        failures.push(`${file} links to missing file ${rawLink}`);
      }
    }
  }
}

async function checkExampleConfigs(allFiles: readonly string[]): Promise<void> {
  const configs = allFiles.filter((file) => /^examples\/sepigs.*\.(json|yaml|yml)$/u.test(file));
  for (const file of configs) {
    try {
      const raw = await readFile(file, "utf8");
      const parsed = extname(file) === ".json" ? (JSON.parse(raw) as unknown) : (YAML.parse(raw) as unknown);
      parseConfig(parsed);
    } catch (error) {
      failures.push(`${file} does not pass config schema: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

async function listFiles(root: string): Promise<readonly string[]> {
  const output: string[] = [];
  const walk = async (dir: string): Promise<void> => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") {
        continue;
      }
      const path = join(dir, entry.name);
      const relative = path.startsWith("./") ? path.slice(2) : path;
      if (entry.isDirectory()) {
        await walk(relative);
        continue;
      }
      output.push(relative);
    }
  };
  await walk(root);
  return output;
}

function isDocFile(file: string): boolean {
  return (
    file.endsWith(".md") &&
    (file.startsWith("docs/") ||
      file.startsWith("examples/") ||
      file.startsWith("verification/") ||
      ["README.md", "RELEASE.md", "CHANGELOG.md", "CONTRIBUTING.md"].includes(file) ||
      file.startsWith("release-notes"))
  );
}

function checkRequiredFiles(allFiles: readonly string[]): void {
  const available = new Set(allFiles);
  const required = [
    "docs/beta-readiness.md",
    "docs/technical-debt.md",
    "docs/reality-check-v2.md",
    "docs/soak-24h-report.md",
    "docs/udp.md",
    "docs/fake-ip.md",
    "docs/subscription.md",
    "docs/dashboard-api.md",
    "docs/dashboard.md",
    "docs/tun.md",
    "docs/quic-hysteria2-evaluation.md",
    "docs/wireguard-evaluation.md",
    "docs/phase8-reality-check.md",
    "docs/phase8-validation.md",
    "docs/phase9-regression-matrix.md",
    "docs/udp-benchmark.md",
    "docs/fake-ip-validation.md",
    "docs/dashboard-security.md",
    "docs/subscription-compat.md",
    "docs/v0.2.0-security-review.md",
    "docs/v0.2.0-beta-readiness.md",
    "docs/soak-v0.2.0-beta-report.md",
    "docs/release-v0.2.0-beta-artifacts.md",
    "release-notes.md",
    "release-notes-v0.2.0-beta.md",
    "verification/mihomo.md",
    "verification/shadowrocket.md",
    "verification/surge.md",
    "verification/stash.md",
    "verification/nekobox.md",
    "verification/v2rayn.md"
  ];
  for (const file of required) {
    if (!available.has(file)) {
      failures.push(`required beta/RC1 document is missing: ${file}`);
    }
  }
}

function shouldSkipLink(link: string): boolean {
  return (
    link.startsWith("http://") ||
    link.startsWith("https://") ||
    link.startsWith("mailto:") ||
    link.startsWith("#") ||
    link.startsWith("plugin://")
  );
}
