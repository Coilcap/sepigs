import assert from "node:assert/strict";
import test from "node:test";
import { auditEvidenceText } from "../tools/compat/evidence-pack.js";

void test("compat evidence audit rejects local paths, keys, and test secrets", () => {
  const findings = auditEvidenceText("bad.json", [
    "/Users/example/bin/tool",
    "/opt/homebrew/bin/tool",
    "-----BEGIN PRIVATE KEY-----",
    "sepigs-test-only-password-v1"
  ].join("\n"));
  assert.equal(findings.length, 4);
});

void test("compat evidence audit accepts redacted evidence", () => {
  const findings = auditEvidenceText("good.json", JSON.stringify({
    path: "${HOMEBREW_PREFIX}/bin/tool",
    password: "[REDACTED_TEST_SECRET]"
  }));
  assert.deepEqual(findings, []);
});
