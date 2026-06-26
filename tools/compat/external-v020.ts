import { mkdir, writeFile } from "node:fs/promises";
import { checkExternalBinaries } from "./check-binaries.js";

interface ExternalCase {
  readonly protocol: "shadowsocks" | "trojan";
  readonly case: string;
  readonly status: "skipped-with-reason" | "blocked-with-reason";
  readonly reason: string;
  readonly candidates: readonly string[];
}

const binaries = await checkExternalBinaries();
const missingReason = (names: readonly string[]): string => `Skipped: no supported external reference binary found. Checked ${names.join(", ")}.`;
const blockedReason = (paths: readonly string[]): string => `Blocked: external reference binary detected (${paths.join(", ")}) but this release has no vetted automatic launcher for it; no verified interoperability result is claimed.`;
const ssNames = ["sslocal", "ssserver", "ss-local", "ss-server", "sing-box"];
const trojanNames = ["trojan-go", "sing-box", "xray"];

const detectedPathsFor = (names: readonly string[]): readonly string[] => binaries
  .filter((binary) => binary.path !== undefined && binary.candidates.some((candidate) => names.includes(candidate)))
  .map((binary) => binary.path as string);

const ssDetected = detectedPathsFor(ssNames);
const trojanDetected = detectedPathsFor(trojanNames);
const ssStatus = ssDetected.length === 0 ? "skipped-with-reason" : "blocked-with-reason";
const trojanStatus = trojanDetected.length === 0 ? "skipped-with-reason" : "blocked-with-reason";
const ssReason = ssDetected.length === 0 ? missingReason(ssNames) : blockedReason(ssDetected);
const trojanReason = trojanDetected.length === 0 ? missingReason(trojanNames) : blockedReason(trojanDetected);

const cases: ExternalCase[] = [
  ...["reference client -> sepigs inbound aes-128-gcm", "reference client -> sepigs inbound aes-256-gcm", "reference client -> sepigs inbound chacha20-ietf-poly1305", "wrong password", "large payload", "remote close"].map((name): ExternalCase => ({ protocol: "shadowsocks", case: name, status: ssStatus, reason: ssReason, candidates: ssNames })),
  ...["reference client -> sepigs inbound", "wrong password", "large payload", "remote close", "TLS termination and SNI"].map((name): ExternalCase => ({ protocol: "trojan", case: name, status: trojanStatus, reason: trojanReason, candidates: trojanNames }))
];

await mkdir("reports/compat", { recursive: true });
const installSuggestions = [
  "cargo install shadowsocks-rust",
  "brew install shadowsocks-libev",
  "brew install sing-box",
  "brew install xray",
  "go install github.com/p4gefau1t/trojan-go@latest"
] as const;
const skipped = cases.filter((item) => item.status === "skipped-with-reason").length;
const blocked = cases.filter((item) => item.status === "blocked-with-reason").length;
const report = { generatedAt: new Date().toISOString(), binaries, installSuggestions, cases, summary: { verified: 0, skipped, blocked, failed: 0 } };
await writeFile("reports/compat/external-v0.2.0-beta.json", `${JSON.stringify(report, null, 2)}\n`, "utf8");
await writeFile("reports/compat/external-v0.2.0-beta.md", ["# External Compatibility v0.2.0-beta.0", "", "No external interoperability result is claimed unless a vetted reference launcher completes the case.", "", "## Binary Detection", "", ...binaries.map((item) => `- ${item.name}: ${item.path === undefined ? `missing (${item.candidates.join(", ")})` : `detected at ${item.path}`}`), "", "Installation suggestions:", "", ...installSuggestions.map((command) => `- \`${command}\``), "", "| Protocol | Case | Status | Reason |", "| --- | --- | --- | --- |", ...cases.map((item) => `| ${item.protocol} | ${item.case} | ${item.status} | ${item.reason} |`), "", "Local fixtures remain covered by `npm test`; they are not external reference evidence.", ""].join("\n"), "utf8");
console.log(`external compatibility: 0 verified, ${skipped} skipped with reason, ${blocked} blocked with reason, 0 failed`);
