import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startExternalProcess } from "../tools/compat/process-runner.js";
import { allocateLoopbackPort, isTcpPortOpen } from "../tools/compat/ports.js";
import { createCompatSubdirectory, createCompatTempDirectory } from "../tools/compat/temp.js";

void test("compat process runner captures readiness and releases its port", async () => {
  const temp = await createCompatTempDirectory("runner-ready");
  const port = await allocateLoopbackPort();
  try {
    const artifactDirectory = await createCompatSubdirectory(temp.path, "process");
    const result = await startExternalProcess({
      name: "ready-server",
      command: process.execPath,
      args: ["-e", serverScript(port)],
      artifactDirectory,
      startupTimeoutMs: 2_000,
      stopTimeoutMs: 1_000,
      maxLogBytes: 4_096,
      cleanupPorts: [port],
      readiness: async () => await isTcpPortOpen(port)
    });
    assert.equal(result.status, "ready");
    const stopped = await result.process.stop();
    assert.equal(stopped.forced, false);
    assert.equal(stopped.portsReleased, true);
    assert.equal(await isTcpPortOpen(port), false);
    assert.match(await readFile(`${artifactDirectory}/process.json`, "utf8"), /"portsReleased": true/u);
  } finally {
    await temp.cleanup();
  }
});

void test("compat process runner bounds stdout and stderr", async () => {
  const temp = await createCompatTempDirectory("runner-output");
  const port = await allocateLoopbackPort();
  try {
    const artifactDirectory = await createCompatSubdirectory(temp.path, "process");
    const script = `const net=require("node:net");process.stdout.write("x".repeat(4096));process.stderr.write("y".repeat(4096));const s=net.createServer(()=>{});s.listen(${port},"127.0.0.1");process.on("SIGTERM",()=>s.close(()=>process.exit(0)));`;
    const result = await startExternalProcess({
      name: "bounded-output",
      command: process.execPath,
      args: ["-e", script],
      artifactDirectory,
      startupTimeoutMs: 2_000,
      stopTimeoutMs: 1_000,
      maxLogBytes: 128,
      cleanupPorts: [port],
      readiness: async () => await isTcpPortOpen(port)
    });
    assert.equal(result.status, "ready");
    await new Promise<void>((resolve) => setTimeout(resolve, 50));
    const stopped = await result.process.stop();
    assert.equal(stopped.stdoutTruncated, true);
    assert.equal(stopped.stderrTruncated, true);
    assert.ok(Buffer.byteLength(stopped.stdout) <= 128);
    assert.ok(Buffer.byteLength(stopped.stderr) <= 128);
  } finally {
    await temp.cleanup();
  }
});

void test("compat process runner contains child crashes", async () => {
  const temp = await createCompatTempDirectory("runner-crash");
  try {
    const artifactDirectory = await createCompatSubdirectory(temp.path, "process");
    const result = await startExternalProcess({
      name: "crash",
      command: process.execPath,
      args: ["-e", "console.error('expected crash');process.exit(7)"],
      artifactDirectory,
      startupTimeoutMs: 1_000,
      stopTimeoutMs: 500,
      maxLogBytes: 4_096,
      readiness: () => Promise.resolve(false)
    });
    assert.equal(result.status, "failed");
    const stopped = await result.process.stop();
    assert.equal(stopped.exitCode, 7);
    assert.match(stopped.stderr, /expected crash/u);
  } finally {
    await temp.cleanup();
  }
});

void test("compat process runner kills startup timeouts", async () => {
  const temp = await createCompatTempDirectory("runner-timeout");
  try {
    const artifactDirectory = await createCompatSubdirectory(temp.path, "process");
    const result = await startExternalProcess({
      name: "timeout",
      command: process.execPath,
      args: ["-e", "setInterval(()=>{},1000)"],
      artifactDirectory,
      startupTimeoutMs: 100,
      stopTimeoutMs: 500,
      maxLogBytes: 4_096,
      readiness: () => Promise.resolve(false)
    });
    assert.equal(result.status, "timeout");
    const stopped = await result.process.stop();
    assert.ok(stopped.exitCode !== null || stopped.signal !== null);
  } finally {
    await temp.cleanup();
  }
});

void test("compat process runner rejects a command that cannot spawn", async () => {
  const temp = await createCompatTempDirectory("runner-spawn-error");
  try {
    const artifactDirectory = await createCompatSubdirectory(temp.path, "process");
    const result = await startExternalProcess({
      name: "missing-command",
      command: `${temp.path}/does-not-exist`,
      args: [],
      artifactDirectory,
      startupTimeoutMs: 1_000,
      stopTimeoutMs: 100,
      maxLogBytes: 4_096
    });
    assert.equal(result.status, "failed");
    assert.match(result.reason, /failed to spawn/u);
    const stopped = await result.process.stop();
    assert.match(stopped.stderr, /spawn error/u);
  } finally {
    await temp.cleanup();
  }
});

const serverScript = (port: number): string =>
  `const net=require("node:net");const s=net.createServer((c)=>c.end());s.listen(${port},"127.0.0.1",()=>console.log("ready"));process.on("SIGTERM",()=>s.close(()=>process.exit(0)));`;
