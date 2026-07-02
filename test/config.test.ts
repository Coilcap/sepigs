import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";
import { tmpdir } from "node:os";
import { loadConfig } from "../src/config/loader.js";
import { parseConfig } from "../src/config/schema.js";
import { ConfigError } from "../src/utils/errors.js";

void test("parseConfig applies defaults and validates references", () => {
  const config = parseConfig({
    inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
        outbounds: [{ type: "direct", tag: "direct" }],
        route: { defaultOutbound: "direct", rules: [] }
  });

  assert.equal(config.log.level, "info");
  assert.equal(config.limits.connectTimeoutMs, 10_000);
  assert.equal(config.inbounds[0]?.tag, "http-in");
  assert.equal(config.route.defaultOutbound, "direct");
});

void test("parseConfig reports clear validation errors", () => {
  assert.throws(
    () =>
      parseConfig({
        inbounds: [{ type: "socks5", tag: "socks", listen: "127.0.0.1", port: 1080 }],
        outbounds: [{ type: "direct", tag: "direct" }],
        route: {
          defaultOutbound: "missing",
          ruleSetFiles: [{ tag: "bad-set", path: "missing.json", outboundTag: "missing" }],
          rules: [{ outboundTag: "direct", ipCidr: ["not-a-cidr"] }]
        }
      }),
    (error: unknown) => {
      assert.ok(error instanceof ConfigError);
      assert.match(error.message, /route\.defaultOutbound references unknown outbound "missing"/u);
      assert.match(error.message, /route\.ruleSetFiles\[0\]\.outboundTag references unknown outbound "missing"/u);
      assert.match(error.message, /route\.rules\[0\]\.ipCidr\[0\] must be a valid CIDR/u);
      return true;
    }
  );
});

void test("reload defaults to legacy and transactional mode requires an explicit safe allowlist", () => {
  const legacy = parseConfig({
    inbounds: [{ type: "http", tag: "http", listen: "127.0.0.1", port: 0 }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });
  assert.deepEqual(legacy.reload, {
    mode: "legacy",
    transactional: {
      enabledComponents: [],
      timeoutMs: 5_000,
      shadowBeforeCommit: true,
      rollbackOnFailure: true
    }
  });

  const experimental = parseConfig({
    reload: {
      mode: "transactional-experimental",
      transactional: {
        enabledComponents: ["metrics", "dashboard"],
        timeoutMs: 2_000,
        shadowBeforeCommit: true,
        rollbackOnFailure: true
      }
    },
    inbounds: [{ type: "http", tag: "http", listen: "127.0.0.1", port: 0 }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });
  assert.deepEqual(experimental.reload.transactional.enabledComponents, ["metrics", "dashboard"]);
});

void test("transactional reload rejects unsupported, duplicate, and rollback-disabled components", () => {
  const base = {
    inbounds: [{ type: "http", tag: "http", listen: "127.0.0.1", port: 0 }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  };
  assert.throws(() => parseConfig({
    ...base,
    reload: {
      mode: "transactional-experimental",
      transactional: {
        enabledComponents: ["metrics", "metrics", "inbound"],
        rollbackOnFailure: false
      }
    }
  }), /duplicate component "metrics".*unsupported component "inbound".*rollbackOnFailure must be true/su);
});

void test("loadConfig supports YAML configs and expands rule-set files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sepigs-config-"));
  const ruleSetPath = join(dir, "rules.yaml");
  const configPath = join(dir, "sepigs.yaml");

  await writeFile(
    ruleSetPath,
    [
      "rules:",
      "  - tag: blocked-suffix",
      "    domainSuffix:",
      "      - blocked.test",
      "  - tag: exact-special",
      "    domain:",
      "      - exact.test"
    ].join("\n"),
    "utf8"
  );

  await writeFile(
    configPath,
    [
      "log:",
      "  level: silent",
      "inbounds:",
      "  - type: http",
      "    tag: http-in",
      "    listen: 127.0.0.1",
      "    port: 0",
      "outbounds:",
      "  - type: direct",
      "    tag: direct",
      "  - type: block",
      "    tag: block",
      "route:",
      "  defaultOutbound: direct",
      "  ruleSetFiles:",
      "    - tag: file-set",
      "      path: rules.yaml",
      "      outboundTag: block",
      "  rules:",
      "    - tag: inline",
      "      port: 8080",
      "      outboundTag: direct"
    ].join("\n"),
    "utf8"
  );

  const config = await loadConfig(configPath);
  const firstRule = config.route.rules[0];
  const thirdRule = config.route.rules[2];
  assert.ok(firstRule);
  assert.ok(thirdRule);
  assert.equal(config.log.level, "silent");
  assert.equal(config.route.rules.length, 3);
  assert.equal(firstRule.tag, "file-set:blocked-suffix");
  assert.equal(firstRule.outboundTag, "block");
  assert.equal(thirdRule.tag, "inline");
});
