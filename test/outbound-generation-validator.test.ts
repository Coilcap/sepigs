import assert from "node:assert/strict";
import test from "node:test";
import type { OutboundConfig } from "../src/config/types.js";
import { diffOutboundConfigs } from "../src/outbound/generationBuilder.js";
import { validateOutboundGeneration } from "../src/outbound/generationValidator.js";

void test("validator rejects duplicate tags and missing policy references", () => {
  const outbounds: readonly OutboundConfig[] = [
    { type: "direct", tag: "same" },
    { type: "block", tag: "same" }
  ];
  const result = validateOutboundGeneration({
    outbounds,
    defaultOutbound: "missing-default",
    policies: [{
      tag: "policy",
      type: "failover",
      strategy: "roundRobin",
      outbounds: ["missing-policy"],
      unhealthyAfterFailures: 1,
      recoverAfterMs: 100
    }]
  });
  assert.deepEqual(
    result.errors.map((issue) => issue.code),
    ["duplicate-tag", "missing-default-outbound", "missing-policy-outbound"]
  );
});

void test("validator requires explicit opt-in for experimental outbounds", () => {
  const wireguard = wireguardConfig();
  const blocked = validateOutboundGeneration({
    outbounds: [wireguard],
    defaultOutbound: "wg",
    policies: []
  });
  assert.ok(blocked.errors.some((issue) => issue.code === "experimental-not-enabled"));
  assert.equal(blocked.riskSummary.highest, "high");

  const optedIn = validateOutboundGeneration({
    outbounds: [wireguard],
    defaultOutbound: "wg",
    policies: [],
    allowExperimental: true
  });
  assert.equal(optedIn.errors.length, 0);
  assert.ok(optedIn.unsupportedChanges.length > 0);
});

void test("validator checks Shadowsocks cipher and password", () => {
  const invalid = {
    type: "shadowsocks",
    tag: "ss",
    serverHost: "127.0.0.1",
    serverPort: 8388,
    method: "invalid-cipher",
    password: ""
  } as unknown as OutboundConfig;
  const result = validateOutboundGeneration({
    outbounds: [invalid],
    defaultOutbound: "ss",
    policies: []
  });
  assert.ok(result.errors.some((issue) => issue.code === "unsupported-shadowsocks-cipher"));
  assert.ok(result.errors.some((issue) => issue.code === "missing-shadowsocks-password"));
});

void test("validator checks Trojan identity and TCP relay target", () => {
  const outbounds: readonly OutboundConfig[] = [
    {
      type: "trojan",
      tag: "trojan",
      serverHost: "server.test",
      serverPort: 443,
      password: "",
      tls: {
        enabled: true,
        serverName: "",
        rejectUnauthorized: true
      }
    },
    {
      type: "tcpRelay",
      tag: "relay",
      targetHost: "bad host",
      targetPort: 0
    }
  ];
  const result = validateOutboundGeneration({
    outbounds,
    defaultOutbound: "trojan",
    policies: []
  });
  assert.ok(result.errors.some((issue) => issue.code === "missing-trojan-password"));
  assert.ok(result.errors.some((issue) => issue.code === "invalid-trojan-server-name"));
  assert.ok(result.errors.some((issue) => issue.code === "invalid-target-host"));
  assert.ok(result.errors.some((issue) => issue.code === "invalid-target-port"));
});

void test("validator rejects extra direct and block fields", () => {
  const direct = {
    type: "direct",
    tag: "direct",
    password: "must-not-be-accepted"
  } as unknown as OutboundConfig;
  const result = validateOutboundGeneration({
    outbounds: [direct],
    defaultOutbound: "direct",
    policies: []
  });
  assert.ok(result.errors.some((issue) => issue.code === "dangerous-extra-fields"));
  assert.equal(JSON.stringify(result).includes("must-not-be-accepted"), false);
});

void test("validator warns when a removed outbound still has active references", () => {
  const current: readonly OutboundConfig[] = [
    { type: "direct", tag: "old" },
    { type: "block", tag: "keep" }
  ];
  const candidate: readonly OutboundConfig[] = [
    { type: "block", tag: "keep" }
  ];
  const diff = diffOutboundConfigs(current, candidate);
  const result = validateOutboundGeneration({
    outbounds: candidate,
    defaultOutbound: "keep",
    policies: [],
    activePolicies: [{
      tag: "active-policy",
      type: "failover",
      strategy: "roundRobin",
      outbounds: ["old"],
      unhealthyAfterFailures: 1,
      recoverAfterMs: 100
    }],
    activeReferenceTags: ["old"],
    diff
  });
  assert.deepEqual(
    result.warnings.map((issue) => issue.code),
    [
      "removed-active-policy-reference",
      "removed-active-connection-reference"
    ]
  );
});

void test("validator redacts changed secret identity warnings", () => {
  const oldOutbound = shadowsocks("old-secret-value");
  const candidate = shadowsocks("new-secret-value");
  const diff = diffOutboundConfigs([oldOutbound], [candidate]);
  const result = validateOutboundGeneration({
    outbounds: [candidate],
    defaultOutbound: "ss",
    policies: [],
    diff
  });
  const serialized = JSON.stringify(result);
  assert.ok(serialized.includes("[REDACTED]"));
  assert.equal(serialized.includes("old-secret-value"), false);
  assert.equal(serialized.includes("new-secret-value"), false);
});

const shadowsocks = (password: string): OutboundConfig => ({
  type: "shadowsocks",
  tag: "ss",
  serverHost: "127.0.0.1",
  serverPort: 8388,
  method: "aes-128-gcm",
  password
});

const wireguardConfig = (): OutboundConfig => ({
  type: "wireguard",
  tag: "wg",
  privateKey: "test-only-private-key",
  address: ["10.0.0.2/32"],
  peer: {
    publicKey: "test-only-public-key",
    endpointHost: "127.0.0.1",
    endpointPort: 51820,
    allowedIps: ["0.0.0.0/0"]
  }
});
