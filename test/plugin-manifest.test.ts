import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { loadPluginManifest } from "../src/plugin/manifest.js";

void test("loadPluginManifest validates apiVersion and permissions", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sepigs-manifest-"));
  const manifestPath = join(dir, "manifest.json");
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: "good",
      version: "0.1.0",
      type: "outbound",
      entry: "index.mjs",
      permissions: ["outbound:register"],
      apiVersion: "1",
      description: "good plugin"
    }),
    "utf8"
  );
  const manifest = await loadPluginManifest(manifestPath);
  assert.equal(manifest.name, "good");
  assert.equal(manifest.permissions[0], "outbound:register");
});

void test("Plugin sandbox blocks registration without permission", async () => {
  const dir = await mkdtemp(join(tmpdir(), "sepigs-plugin-sandbox-"));
  const manifestPath = join(dir, "manifest.json");
  const entryPath = join(dir, "index.mjs");
  await writeFile(
    manifestPath,
    JSON.stringify({
      name: "no-permission",
      version: "0.1.0",
      type: "outbound",
      entry: "index.mjs",
      permissions: [],
      apiVersion: "1",
      description: "missing permission"
    }),
    "utf8"
  );
  await writeFile(
    entryPath,
    [
      "export default {",
      "  setup(ctx) {",
      "    ctx.registerOutboundFactory('plugin.denied', () => ({ tag: 'denied', type: 'plugin.denied', async connect() { throw new Error('never'); }, async stop() {} }));",
      "  }",
      "};"
    ].join("\n"),
    "utf8"
  );

  const config = parseConfig({
    log: { level: "silent" },
    plugins: { modules: [{ tag: "no-permission", path: manifestPath }], wasm: [] },
    inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  });
  const engine = new Engine(config);
  await assert.rejects(
    async () => {
      await engine.start();
    },
    /does not have outbound:register permission/u
  );
});
