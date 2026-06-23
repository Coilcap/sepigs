import { spawn } from "node:child_process";
import { access, mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import YAML from "yaml";

const required = ["README.md", "chrome-system.md", "shadowrocket.md", "mihomo.yaml", "clash-verge.md", "stash.yaml", "surge.conf", "nekobox.md", "v2rayn.md"];
for (const file of required) await access(`verification/manual-pack/${file}`);
for (const file of ["mihomo.yaml", "stash.yaml"]) {
  const parsed = YAML.parse(await readFile(`verification/manual-pack/${file}`, "utf8")) as unknown;
  if (typeof parsed !== "object" || parsed === null) throw new Error(`${file} must contain a YAML object`);
}
const mihomo = await readFile("verification/manual-pack/mihomo.yaml", "utf8");
const stash = await readFile("verification/manual-pack/stash.yaml", "utf8");
const surge = await readFile("verification/manual-pack/surge.conf", "utf8");
for (const [file, contents] of [["mihomo.yaml", mihomo], ["stash.yaml", stash], ["surge.conf", surge]] as const) {
  for (const placeholder of ["SEPIGS_HOST", "SEPIGS_USERNAME", "SEPIGS_PASSWORD"]) {
    if (!contents.includes(placeholder)) throw new Error(`${file} is missing ${placeholder}`);
  }
}
await mkdir("artifacts", { recursive: true });
const output = resolve("artifacts/sepigs-v0.2.0-client-verification-pack.zip"); await rm(output, { force: true });
await new Promise<void>((resolvePromise, reject) => { const child = spawn("zip", ["-qr", output, "manual-pack"], { cwd: "verification", stdio: "inherit" }); child.once("error", reject); child.once("exit", (code) => { if (code === 0) { resolvePromise(); return; } reject(new Error(`zip exited with code ${code ?? 1}`)); }); });
console.log(output);
