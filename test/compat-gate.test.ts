import assert from "node:assert/strict";
import test from "node:test";
import { evaluateCompatibilityGate } from "../tools/compat/compat-gate.js";

const baseline = {
  schemaVersion: 1 as const,
  baselineName: "test",
  createdAt: "2026-07-01T00:00:00.000Z",
  source: "test",
  changeNote: "test baseline",
  maximumVerifiedDropPercent: 20,
  implementations: {
    "sing-box": { versionPrefix: "sing-box version 1", verified: 1 },
    xray: { versionPrefix: "Xray 2", verified: 1 }
  }
};

const verifiedCase = (implementation: "sing-box" | "xray") => ({
  caseId: `${implementation}-happy`,
  referenceImplementation: implementation,
  referenceVersion: implementation === "sing-box" ? "sing-box version 1.0" : "Xray 2.0",
  sepigsRole: "outbound" as const,
  protocol: "trojan" as const,
  payloadSize: 1,
  command: implementation,
  result: "verified" as const,
  reason: "payload passed",
  stdoutExcerpt: "",
  stderrExcerpt: "",
  reproductionCommand: "npm run compat:external:v1",
  artifactPath: "system-temp/test",
  startedAt: "2026-07-01T00:00:00.000Z",
  completedAt: "2026-07-01T00:00:01.000Z"
});

void test("compat gate passes a stable verified baseline", () => {
  const cases = [verifiedCase("sing-box"), verifiedCase("xray")];
  const result = evaluateCompatibilityGate(baseline, {
    generatedAt: "2026-07-01T00:00:00.000Z",
    cases,
    summary: { verified: 2, failed: 0, skipped: 0, blocked: 0, unsupported: 0 }
  });
  assert.equal(result.passed, true);
});

void test("compat gate rejects failed cases and verified regression", () => {
  const failed = { ...verifiedCase("xray"), result: "failed" as const, reason: "payload mismatch" };
  const result = evaluateCompatibilityGate(baseline, {
    generatedAt: "2026-07-01T00:00:00.000Z",
    cases: [verifiedCase("sing-box"), failed],
    summary: { verified: 1, failed: 1, skipped: 0, blocked: 0, unsupported: 0 }
  });
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((finding) => finding.includes("failed case")));
  assert.ok(result.findings.some((finding) => finding.includes("verified count dropped")));
});

void test("compat gate requires reasons for non-verified capability states", () => {
  const skipped = { ...verifiedCase("xray"), result: "skipped" as const, reason: "" };
  const result = evaluateCompatibilityGate(baseline, {
    generatedAt: "2026-07-01T00:00:00.000Z",
    cases: [verifiedCase("sing-box"), skipped],
    summary: { verified: 1, failed: 0, skipped: 1, blocked: 0, unsupported: 0 }
  });
  assert.equal(result.passed, false);
  assert.ok(result.findings.some((finding) => finding.includes("has no reason")));
});
