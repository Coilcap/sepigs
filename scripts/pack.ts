#!/usr/bin/env tsx
import { cp, mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";

const ROOT = process.cwd();
const STAGE = join(ROOT, "dist-release", "sepigs");

const INCLUDE = ["dist", "package.json", "package-lock.json", "README.md", "LICENSE", "examples", "docs", "CHANGELOG.md", "RELEASE.md"];

const main = async (): Promise<void> => {
  const mode = process.argv[2] ?? "dry-run";
  const files = await collectReleaseFiles();
  if (mode === "dry-run") {
    console.log(renderDryRun(files));
    return;
  }

  await stageRelease(files);
  if (mode === "tar") {
    await run("tar", ["-czf", join(ROOT, "dist-release", "sepigs.tar.gz"), "-C", join(ROOT, "dist-release"), "sepigs"]);
    console.log("created dist-release/sepigs.tar.gz");
    return;
  }
  if (mode === "zip") {
    await run("zip", ["-qr", join(ROOT, "dist-release", "sepigs.zip"), "sepigs"], join(ROOT, "dist-release"));
    console.log("created dist-release/sepigs.zip");
    return;
  }
  throw new Error(`unknown pack mode "${mode}"`);
};

const collectReleaseFiles = async (): Promise<readonly string[]> => {
  const output: string[] = [];
  for (const entry of INCLUDE) {
    if (!(await exists(entry))) {
      continue;
    }
    const entryStat = await stat(entry);
    if (entryStat.isDirectory()) {
      output.push(...(await walk(entry)));
    } else {
      output.push(entry);
    }
  }
  return output
    .filter(
      (path) =>
        !path.endsWith(".DS_Store") &&
        !path.includes("node_modules/") &&
        !path.startsWith("test/") &&
        !path.startsWith("dist/test/") &&
        !path.startsWith("profiles/")
    )
    .sort();
};

const stageRelease = async (files: readonly string[]): Promise<void> => {
  await rm(join(ROOT, "dist-release"), { recursive: true, force: true });
  await mkdir(STAGE, { recursive: true });
  for (const file of files) {
    const destination = join(STAGE, file);
    await mkdir(dirname(destination), { recursive: true });
    await cp(join(ROOT, file), destination);
  }
  await writeFile(join(STAGE, "RELEASE-FILES.txt"), `${files.join("\n")}\n`, "utf8");
};

const walk = async (dir: string): Promise<readonly string[]> => {
  const entries = await readdir(dir, { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      output.push(...(await walk(path)));
    } else if (entry.isFile()) {
      output.push(path);
    }
  }
  return output;
};

const exists = async (path: string): Promise<boolean> => {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
};

const run = async (command: string, args: readonly string[], cwd = ROOT): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(command, [...args], { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with code ${code ?? 1}`));
    });
  });
};

const renderDryRun = (files: readonly string[]): string => {
  return ["sepigs release dry-run", "", "Included files:", ...files.map((file) => `- ${file}`), "", `Total files: ${files.length}`].join("\n");
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
