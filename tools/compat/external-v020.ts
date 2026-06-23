import { mkdir, writeFile } from "node:fs/promises";
import { checkExternalBinaries } from "./check-binaries.js";

interface ExternalCase { readonly protocol: "shadowsocks" | "trojan"; readonly case: string; readonly status: "skipped-with-reason"; readonly reason: string; readonly candidates: readonly string[] }
const binaries = await checkExternalBinaries();
const available = binaries.filter((binary) => binary.path !== undefined);
const missingReason = (names: readonly string[]): string => `Skipped: no supported external reference binary found. Checked ${names.join(", ")}.`;
const ssNames = ["sslocal", "ssserver", "ss-local", "ss-server", "sing-box"];
const trojanNames = ["trojan-go", "sing-box", "xray"];
const cases: ExternalCase[] = [
  ...["reference client -> sepigs inbound aes-128-gcm", "reference client -> sepigs inbound aes-256-gcm", "reference client -> sepigs inbound chacha20-ietf-poly1305", "wrong password", "large payload", "remote close"].map((name): ExternalCase => ({ protocol: "shadowsocks", case: name, status: "skipped-with-reason", reason: missingReason(ssNames), candidates: ssNames })),
  ...["reference client -> sepigs inbound", "wrong password", "large payload", "remote close", "TLS termination and SNI"].map((name): ExternalCase => ({ protocol: "trojan", case: name, status: "skipped-with-reason", reason: missingReason(trojanNames), candidates: trojanNames }))
];
if (available.length > 0) throw new Error(`External binaries were detected (${available.map((item) => item.path).join(", ")}) but this release has no vetted automatic launcher for them; refusing to report skipped or verified.`);
await mkdir("reports/compat", { recursive: true });
const installSuggestions = [
  "cargo install shadowsocks-rust",
  "brew install shadowsocks-libev",
  "brew install sing-box",
  "brew install xray",
  "go install github.com/p4gefau1t/trojan-go@latest"
] as const;
const report = { generatedAt: new Date().toISOString(), binaries, installSuggestions, cases, summary: { verified: 0, skipped: cases.length, failed: 0 } };
await writeFile("reports/compat/external-v0.2.0-beta.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile("reports/compat/external-v0.2.0-beta.md", ["# External Compatibility v0.2.0-beta.0", "", "No supported reference binary was installed; no external interoperability result is claimed.", "", "## Missing Binaries", "", ...binaries.map((item) => `- ${item.name}: missing (${item.candidates.join(", ")})`), "", "Installation suggestions (not executed by this validation):", "", ...installSuggestions.map((command) => `- \`${command}\``), "", "| Protocol | Case | Status | Reason |", "| --- | --- | --- | --- |", ...cases.map((item) => `| ${item.protocol} | ${item.case} | ${item.status} | ${item.reason} |`), "", "Local fixtures remain covered by `npm test`; they are not external reference evidence.", ""].join("\n"), "utf8");
console.log(`external compatibility: 0 verified, ${cases.length} skipped with reason, 0 failed`);
