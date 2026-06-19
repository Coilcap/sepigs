import assert from "node:assert/strict";
import test from "node:test";
import { migrateConfig } from "../src/config/migrate.js";
import { parseConfig } from "../src/config/schema.js";

void test("migrateConfig upgrades missing configVersion to v1 with a warning", () => {
  const result = migrateConfig({
    inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });

  assert.equal(result.warnings.length, 1);
  const config = parseConfig(result.config);
  assert.equal(config.configVersion, 1);
});

void test("migrateConfig rejects unknown future versions", () => {
  assert.throws(
    () => {
      migrateConfig({ configVersion: 99 });
    },
    /newer than this sepigs build/u
  );
});
