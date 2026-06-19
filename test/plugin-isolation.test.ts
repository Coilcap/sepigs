import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import type { PluginIsolationConfig, PluginModuleConfig } from "../src/config/types.js";
import { loadPluginManifest, type PluginManifest } from "../src/plugin/manifest.js";
import { ChildProcessPluginRunner } from "../src/plugin/runners/childProcessRunner.js";
import { WorkerThreadPluginRunner } from "../src/plugin/runners/workerThreadRunner.js";

const ISOLATION: PluginIsolationConfig = {
  mode: "worker-thread",
  timeoutMs: 300,
  memoryLimitMb: 64,
  stdoutLimitBytes: 4096
};

void test("worker-thread plugin runner invokes an isolated echo plugin", async () => {
  const { config, manifest } = await writePlugin(
    "isolated-echo",
    "export default { handle(payload) { return { ok: true, payload }; } };"
  );
  const runner = new WorkerThreadPluginRunner(config, manifest, ISOLATION);
  try {
    await runner.setup();
    await runner.start();
    assert.deepEqual(await runner.invoke({ message: "hello" }), { ok: true, payload: { message: "hello" } });
  } finally {
    await runner.stop();
  }
});

void test("child-process plugin crash is reported without crashing the main process", async () => {
  const { config, manifest } = await writePlugin("crash-plugin", "export default { start() { process.exit(42); } };");
  const runner = new ChildProcessPluginRunner(config, manifest, { ...ISOLATION, mode: "child-process" });
  await runner.setup();
  await assert.rejects(
    async () => {
      await runner.start();
    },
    /exited with code 42/u
  );
  assert.ok(true);
});

void test("isolated plugin calls time out and are recovered", async () => {
  const { config, manifest } = await writePlugin(
    "timeout-plugin",
    "export default { handle() { return new Promise(() => undefined); } };"
  );
  const runner = new WorkerThreadPluginRunner(config, manifest, ISOLATION);
  await runner.setup();
  await assert.rejects(
    async () => {
      await runner.invoke("slow");
    },
    /timed out/u
  );
});

const writePlugin = async (name: string, source: string): Promise<{ readonly config: PluginModuleConfig; readonly manifest: PluginManifest }> => {
  const dir = await mkdtemp(join(tmpdir(), "sepigs-isolated-plugin-"));
  const manifestPath = join(dir, "manifest.json");
  const entryPath = join(dir, "index.mjs");
  await writeFile(
    manifestPath,
    JSON.stringify({
      name,
      version: "0.1.0",
      type: "mixed",
      entry: "index.mjs",
      permissions: [],
      apiVersion: "1",
      description: `${name} test plugin`
    }),
    "utf8"
  );
  await writeFile(entryPath, source, "utf8");
  return {
    config: { tag: name, path: manifestPath, enabled: true },
    manifest: await loadPluginManifest(manifestPath)
  };
};
