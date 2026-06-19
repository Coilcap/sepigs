import { access, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import YAML from "yaml";

interface ValidationResult {
  readonly client: string;
  readonly file: string;
  readonly status: "valid" | "skipped" | "failed";
  readonly reason: string;
}

const results: ValidationResult[] = [];
await validateYaml("Mihomo", "examples/clients/mihomo.yaml", "mihomo");
await validateYaml("Stash", "examples/clients/stash.yaml", "stash");
await validateSurge("Surge", "examples/clients/surge.conf");
await writeFile("examples/clients/validation-results.json", `${JSON.stringify(results, null, 2)}\n`, "utf8");
console.log(render(results));

async function validateYaml(client: string, file: string, binary: string): Promise<void> {
  try {
    const parsed = YAML.parse(await readFile(file, "utf8")) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      results.push({ client, file, status: "failed", reason: "YAML did not parse to an object" });
      return;
    }
    const binaryAvailable = await commandAvailable(binary);
    if (!binaryAvailable) {
      results.push({ client, file, status: "skipped", reason: `${binary} binary not found; YAML parse succeeded` });
      return;
    }
    const check = await run(binary, ["-t", "-f", file]);
    results.push({
      client,
      file,
      status: check.exitCode === 0 ? "valid" : "failed",
      reason: check.stdout.trim() || check.stderr.trim() || `exit ${check.exitCode}`
    });
  } catch (error) {
    results.push({ client, file, status: "failed", reason: error instanceof Error ? error.message : String(error) });
  }
}

async function validateSurge(client: string, file: string): Promise<void> {
  try {
    const content = await readFile(file, "utf8");
    const requiredSections = ["[General]", "[Proxy]", "[Proxy Group]", "[Rule]"];
    const missing = requiredSections.filter((section) => !content.includes(section));
    if (missing.length > 0) {
      results.push({ client, file, status: "failed", reason: `missing sections: ${missing.join(", ")}` });
      return;
    }
    results.push({ client, file, status: "skipped", reason: "Surge CLI validator not available; static section validation passed" });
  } catch (error) {
    results.push({ client, file, status: "failed", reason: error instanceof Error ? error.message : String(error) });
  }
}

async function commandAvailable(command: string): Promise<boolean> {
  const paths = (process.env.PATH ?? "").split(":");
  for (const entry of paths) {
    try {
      await access(`${entry}/${command}`);
      return true;
    } catch {
      // Continue searching PATH.
    }
  }
  return false;
}

async function run(command: string, args: readonly string[]): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve({ exitCode: code ?? 1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
}

function render(values: readonly ValidationResult[]): string {
  return values.map((value) => `${value.client}: ${value.status} (${value.reason})`).join("\n");
}
