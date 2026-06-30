import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseConfig } from "../../src/config/schema.js";
import type { ShadowsocksCipher } from "../../src/config/types.js";
import { Engine } from "../../src/core/engine.js";
import { Logger } from "../../src/logger/logger.js";
import { ShadowsocksOutbound } from "../../src/outbound/shadowsocks.js";
import { TrojanOutbound } from "../../src/outbound/trojan.js";
import type { TcpStream } from "../../src/protocol/types.js";
import { closeSocket } from "../../src/utils/net.js";
import { generateTestCertificate } from "./certificates.js";
import { SING_BOX_M2_POLICY } from "./cases/sing-box.js";
import { XRAY_M2_POLICY } from "./cases/xray.js";
import {
  generateShadowsocksLibevCommand,
  generateShadowsocksRustConfig,
  generateSingBoxShadowsocksConfig,
  generateSingBoxTrojanConfig,
  generateTrojanGoConfig,
  generateXrayShadowsocksConfig,
  generateXrayTrojanConfig
} from "./config-generators/index.js";
import type {
  CompatTlsFiles,
  ReferenceLaunchPlan,
  ShadowsocksGeneratorInput,
  TrojanGeneratorInput
} from "./config-generators/index.js";
import { startExternalProcess } from "./process-runner.js";
import type { ExternalProcessStopResult, ManagedExternalProcess } from "./process-runner.js";
import { allocateLoopbackPort, COMPAT_LOOPBACK, isTcpPortOpen } from "./ports.js";
import {
  detectReferenceImplementations,
  findDetectedBinary,
  writeReferenceDetectionReport
} from "./reference-detector.js";
import type {
  BinaryDetection,
  ReferenceDetectionReport
} from "./reference-detector.js";
import {
  COMPAT_TEST_ONLY_PASSWORD,
  COMPAT_TEST_ONLY_WRONG_PASSWORD,
  redactCompatText
} from "./secrets.js";
import {
  compatArtifactLabel,
  createCompatSubdirectory,
  createCompatTempDirectory
} from "./temp.js";
import type {
  CompatibilityResult,
  ExternalCompatibilityCase,
  ReferenceImplementation
} from "./types.js";
import { summarizeCases } from "./types.js";

const CIPHERS: readonly ShadowsocksCipher[] = [
  "aes-128-gcm",
  "aes-256-gcm",
  "chacha20-ietf-poly1305"
];
const SMALL_PAYLOAD = Buffer.from("sepigs-external-reference-small", "utf8");
const LARGE_PAYLOAD = Buffer.alloc(1024 * 1024, 0x5a);
const LARGE_PAYLOAD_WARMUP = Buffer.from("sepigs-large-payload-warmup", "utf8");
const REMOTE_CLOSE_PAYLOAD = Buffer.from("sepigs-remote-close-probe", "utf8");
const PROCESS_LOG_LIMIT = 64 * 1024;
const PROCESS_START_TIMEOUT_MS = 5_000;
const PROCESS_STOP_TIMEOUT_MS = 2_000;

type ShadowsocksImplementation = "shadowsocks-rust" | "shadowsocks-libev" | "sing-box" | "xray";
type TrojanImplementation = "sing-box" | "xray" | "trojan-go";

interface CaseContext {
  readonly caseId: string;
  readonly implementation: ReferenceImplementation;
  readonly version: string;
  readonly sepigsRole: "inbound" | "outbound";
  readonly protocol: "shadowsocks" | "trojan";
  readonly payload: Buffer;
  readonly cipher?: ShadowsocksCipher;
  readonly concurrency?: number;
  readonly displayCommand: string;
  readonly artifactPath: string;
  readonly startedAt: string;
}

interface RunningReference {
  readonly process: ManagedExternalProcess;
  readonly plan: ReferenceLaunchPlan;
}

interface SocketScenarioInput {
  readonly payload: Buffer;
  readonly expectFailure?: boolean;
  readonly remoteClose?: boolean;
  readonly concurrency?: number;
}

type ReferenceLaunchOutcome =
  | { readonly status: "ready"; readonly running: RunningReference; readonly reason: string }
  | {
      readonly status: "blocked";
      readonly result: "blocked";
      readonly reason: string;
      readonly stop: ExternalProcessStopResult;
    };

interface HarnessReport {
  readonly generatedAt: string;
  readonly platform: NodeJS.Platform;
  readonly architecture: string;
  readonly detectionGeneratedAt: string;
  readonly cases: readonly ExternalCompatibilityCase[];
  readonly summary: ReturnType<typeof summarizeCases>;
}

export const runExternalCompatibilityHarness = async (
  options: { readonly caseFilter?: string } = {}
): Promise<HarnessReport> => {
  const detection = await detectReferenceImplementations();
  await writeReferenceDetectionReport(detection);
  const temp = await createCompatTempDirectory("harness");
  const cases: ExternalCompatibilityCase[] = [];
  try {
    for (const implementation of ["shadowsocks-rust", "shadowsocks-libev", "sing-box", "xray"] as const) {
      await runShadowsocksCases(implementation, detection, temp.path, cases, options.caseFilter);
    }
    const certificate = await generateTestCertificate(temp.path);
    for (const implementation of ["sing-box", "xray", "trojan-go"] as const) {
      await runTrojanCases(implementation, detection, temp.path, certificate, cases, options.caseFilter);
    }
    addUnsupportedCases(cases, detection, options.caseFilter);
    const report: HarnessReport = {
      generatedAt: new Date().toISOString(),
      platform: process.platform,
      architecture: process.arch,
      detectionGeneratedAt: detection.generatedAt,
      cases,
      summary: summarizeCases(cases)
    };
    await writeHarnessReport(report);
    return report;
  } finally {
    await temp.cleanup();
  }
};

const runShadowsocksCases = async (
  implementation: ShadowsocksImplementation,
  detection: ReferenceDetectionReport,
  tempRoot: string,
  results: ExternalCompatibilityCase[],
  caseFilter: string | undefined
): Promise<void> => {
  const serverBinary = shadowsocksBinary(detection, implementation, "server");
  const clientBinary = shadowsocksBinary(detection, implementation, "client");
  for (const cipher of CIPHERS) {
    for (const payload of [SMALL_PAYLOAD, LARGE_PAYLOAD]) {
      const sizeName = payload === SMALL_PAYLOAD ? "small" : "large";
      const caseId = `ss-${implementation}-sepigs-outbound-${cipher}-${sizeName}`;
      if (selected(caseId, caseFilter)) {
        results.push(await runShadowsocksServerCase({
          caseId, implementation, binary: serverBinary, cipher, payload, password: COMPAT_TEST_ONLY_PASSWORD, tempRoot
        }));
      }
    }
    const clientCaseId = `ss-${implementation}-sepigs-inbound-${cipher}-small`;
    if (selected(clientCaseId, caseFilter)) {
      results.push(await runShadowsocksClientCase({
        caseId: clientCaseId,
        implementation,
        binary: clientBinary,
        cipher,
        payload: SMALL_PAYLOAD,
        password: COMPAT_TEST_ONLY_PASSWORD,
        tempRoot
      }));
    }
  }
  const wrongServerId = `ss-${implementation}-sepigs-outbound-wrong-password`;
  if (selected(wrongServerId, caseFilter)) {
    results.push(await runShadowsocksServerCase({
      caseId: wrongServerId,
      implementation,
      binary: serverBinary,
      cipher: "aes-128-gcm",
      payload: SMALL_PAYLOAD,
      password: COMPAT_TEST_ONLY_WRONG_PASSWORD,
      tempRoot,
      expectFailure: true
    }));
  }
  const wrongClientId = `ss-${implementation}-sepigs-inbound-wrong-password`;
  if (selected(wrongClientId, caseFilter)) {
    results.push(await runShadowsocksClientCase({
      caseId: wrongClientId,
      implementation,
      binary: clientBinary,
      cipher: "aes-128-gcm",
      payload: SMALL_PAYLOAD,
      password: COMPAT_TEST_ONLY_WRONG_PASSWORD,
      tempRoot,
      expectFailure: true
    }));
  }
  const supportsRemoteClose = implementation === "sing-box"
    ? SING_BOX_M2_POLICY.shadowsocks.remoteClose
    : implementation === "xray" && XRAY_M2_POLICY.shadowsocks.remoteClose;
  if (supportsRemoteClose) {
    const remoteServerId = `ss-${implementation}-sepigs-outbound-remote-close`;
    if (selected(remoteServerId, caseFilter)) {
      results.push(await runShadowsocksServerCase({
        caseId: remoteServerId,
        implementation,
        binary: serverBinary,
        cipher: "aes-128-gcm",
        payload: REMOTE_CLOSE_PAYLOAD,
        password: COMPAT_TEST_ONLY_PASSWORD,
        tempRoot,
        remoteClose: true
      }));
    }
    const remoteClientId = `ss-${implementation}-sepigs-inbound-remote-close`;
    if (selected(remoteClientId, caseFilter)) {
      results.push(await runShadowsocksClientCase({
        caseId: remoteClientId,
        implementation,
        binary: clientBinary,
        cipher: "aes-128-gcm",
        payload: REMOTE_CLOSE_PAYLOAD,
        password: COMPAT_TEST_ONLY_PASSWORD,
        tempRoot,
        remoteClose: true
      }));
    }
  }
  if (implementation === "sing-box") {
    const concurrency = SING_BOX_M2_POLICY.shadowsocks.concurrentConnections;
    for (const role of ["outbound", "inbound"] as const) {
      const caseId = `ss-sing-box-sepigs-${role}-concurrent-${concurrency}`;
      if (!selected(caseId, caseFilter)) continue;
      const input = {
        caseId,
        implementation,
        binary: role === "outbound" ? serverBinary : clientBinary,
        cipher: "aes-256-gcm" as const,
        payload: SMALL_PAYLOAD,
        password: COMPAT_TEST_ONLY_PASSWORD,
        tempRoot,
        concurrency
      };
      results.push(role === "outbound"
        ? await runShadowsocksServerCase(input)
        : await runShadowsocksClientCase(input));
    }
  }
};

const runTrojanCases = async (
  implementation: TrojanImplementation,
  detection: ReferenceDetectionReport,
  tempRoot: string,
  certificate: Awaited<ReturnType<typeof generateTestCertificate>>,
  results: ExternalCompatibilityCase[],
  caseFilter: string | undefined
): Promise<void> => {
  const binaryName = implementation === "trojan-go" ? "trojan-go" : implementation;
  const binary = findDetectedBinary(detection, implementation, binaryName);
  for (const payload of [SMALL_PAYLOAD, LARGE_PAYLOAD]) {
    const sizeName = payload === SMALL_PAYLOAD ? "small" : "large";
    const serverId = `trojan-${implementation}-sepigs-outbound-${sizeName}`;
    if (selected(serverId, caseFilter)) {
      results.push(await runTrojanServerCase({
        caseId: serverId, implementation, binary, payload, password: COMPAT_TEST_ONLY_PASSWORD, tempRoot, certificate
      }));
    }
    const clientId = `trojan-${implementation}-sepigs-inbound-${sizeName}`;
    if (selected(clientId, caseFilter)) {
      results.push(await runTrojanClientCase({
        caseId: clientId, implementation, binary, payload, password: COMPAT_TEST_ONLY_PASSWORD, tempRoot, certificate
      }));
    }
  }
  const wrongServerId = `trojan-${implementation}-sepigs-outbound-wrong-password`;
  if (selected(wrongServerId, caseFilter)) {
    results.push(await runTrojanServerCase({
      caseId: wrongServerId,
      implementation,
      binary,
      payload: SMALL_PAYLOAD,
      password: COMPAT_TEST_ONLY_WRONG_PASSWORD,
      tempRoot,
      certificate,
      expectFailure: true
    }));
  }
  const wrongClientId = `trojan-${implementation}-sepigs-inbound-wrong-password`;
  if (selected(wrongClientId, caseFilter)) {
    results.push(await runTrojanClientCase({
      caseId: wrongClientId,
      implementation,
      binary,
      payload: SMALL_PAYLOAD,
      password: COMPAT_TEST_ONLY_WRONG_PASSWORD,
      tempRoot,
      certificate,
      expectFailure: true
    }));
  }
  const supportsRemoteClose = implementation === "sing-box"
    ? SING_BOX_M2_POLICY.trojan.remoteClose
    : implementation === "xray" && XRAY_M2_POLICY.trojan.remoteClose;
  if (supportsRemoteClose) {
    for (const role of ["outbound", "inbound"] as const) {
      const caseId = `trojan-${implementation}-sepigs-${role}-remote-close`;
      if (!selected(caseId, caseFilter)) continue;
      const input = {
        caseId,
        implementation,
        binary,
        payload: REMOTE_CLOSE_PAYLOAD,
        password: COMPAT_TEST_ONLY_PASSWORD,
        tempRoot,
        certificate,
        remoteClose: true
      };
      results.push(role === "outbound"
        ? await runTrojanServerCase(input)
        : await runTrojanClientCase(input));
    }
  }
};

const runShadowsocksServerCase = async (input: {
  readonly caseId: string;
  readonly implementation: ShadowsocksImplementation;
  readonly binary: BinaryDetection | undefined;
  readonly cipher: ShadowsocksCipher;
  readonly payload: Buffer;
  readonly password: string;
  readonly tempRoot: string;
  readonly expectFailure?: boolean;
  readonly remoteClose?: boolean;
  readonly concurrency?: number;
}): Promise<ExternalCompatibilityCase> => {
  const unavailable = unavailableCase(input, "outbound", "shadowsocks");
  if (unavailable !== undefined) return unavailable;
  const startedAt = new Date().toISOString();
  const caseDir = await createCompatSubdirectory(input.tempRoot, input.caseId);
  const echo = await startEchoServer({ remoteClose: input.remoteClose === true });
  const listenPort = await allocateLoopbackPort();
  let running: RunningReference | undefined;
  let outbound: ShadowsocksOutbound | undefined;
  try {
    const binaryPath = requiredBinaryPath(input.binary);
    const plan = await generateShadowsocksPlan({
      implementation: input.implementation,
      binaryPath,
      role: "server",
      directory: caseDir,
      method: input.cipher,
      listenPort,
      password: COMPAT_TEST_ONLY_PASSWORD
    });
    const context = caseContext(input, plan, caseDir, startedAt, "outbound", "shadowsocks");
    const launched = await launchReference(plan, caseDir);
    if (launched.status === "blocked") return completeCase(context, launched.result, launched.reason, launched.stop);
    running = launched.running;
    outbound = new ShadowsocksOutbound({
      type: "shadowsocks",
      tag: "reference",
      serverHost: COMPAT_LOOPBACK,
      serverPort: listenPort,
      method: input.cipher,
      password: input.password
    }, limits(), new Logger("silent"));
    const activeOutbound = outbound;
    await runSocketScenario(
      async () => (await activeOutbound.connect(proxyRequest(echo.port, input.caseId))).socket,
      input
    );
    const stop = await running.process.stop();
    running = undefined;
    return completeCase(context, lifecycleResult(stop), scenarioReason(input), stop);
  } catch (error) {
    const stop = running === undefined ? undefined : await running.process.stop();
    running = undefined;
    return failedCase(input, "outbound", "shadowsocks", caseDir, startedAt, error, stop);
  } finally {
    if (running !== undefined) await running.process.stop();
    if (outbound !== undefined) await outbound.stop();
    await echo.close();
  }
};

const runShadowsocksClientCase = async (input: {
  readonly caseId: string;
  readonly implementation: ShadowsocksImplementation;
  readonly binary: BinaryDetection | undefined;
  readonly cipher: ShadowsocksCipher;
  readonly payload: Buffer;
  readonly password: string;
  readonly tempRoot: string;
  readonly expectFailure?: boolean;
  readonly remoteClose?: boolean;
  readonly concurrency?: number;
}): Promise<ExternalCompatibilityCase> => {
  const unavailable = unavailableCase(input, "inbound", "shadowsocks");
  if (unavailable !== undefined) return unavailable;
  const startedAt = new Date().toISOString();
  const caseDir = await createCompatSubdirectory(input.tempRoot, input.caseId);
  const echo = await startEchoServer({ remoteClose: input.remoteClose === true });
  const engine = createShadowsocksEngine(input.cipher, COMPAT_TEST_ONLY_PASSWORD);
  let running: RunningReference | undefined;
  try {
    await engine.start();
    const inboundPort = addressPort(engine.getInboundAddress("reference-in"));
    const localPort = await allocateLoopbackPort();
    const binaryPath = requiredBinaryPath(input.binary);
    const plan = await generateShadowsocksPlan({
      implementation: input.implementation,
      binaryPath,
      role: "client",
      directory: caseDir,
      method: input.cipher,
      listenPort: localPort,
      serverPort: inboundPort,
      password: input.password
    });
    const context = caseContext(input, plan, caseDir, startedAt, "inbound", "shadowsocks");
    const launched = await launchReference(plan, caseDir);
    if (launched.status === "blocked") return completeCase(context, launched.result, launched.reason, launched.stop);
    running = launched.running;
    if (input.expectFailure === true) {
      await expectSocksFailure(localPort, echo.port, input.payload);
    } else {
      await runSocketScenario(async () => await openSocksTunnel(localPort, echo.port), input);
    }
    const stop = await running.process.stop();
    running = undefined;
    return completeCase(context, lifecycleResult(stop), scenarioReason(input), stop);
  } catch (error) {
    const stop = running === undefined ? undefined : await running.process.stop();
    running = undefined;
    return failedCase(input, "inbound", "shadowsocks", caseDir, startedAt, error, stop);
  } finally {
    if (running !== undefined) await running.process.stop();
    await engine.stop();
    await echo.close();
  }
};

const runTrojanServerCase = async (input: {
  readonly caseId: string;
  readonly implementation: TrojanImplementation;
  readonly binary: BinaryDetection | undefined;
  readonly payload: Buffer;
  readonly password: string;
  readonly tempRoot: string;
  readonly certificate: Awaited<ReturnType<typeof generateTestCertificate>>;
  readonly expectFailure?: boolean;
  readonly remoteClose?: boolean;
}): Promise<ExternalCompatibilityCase> => {
  const unavailable = unavailableTrojanCase(input, "outbound");
  if (unavailable !== undefined) return unavailable;
  const tls = input.certificate.tls as CompatTlsFiles;
  const startedAt = new Date().toISOString();
  const caseDir = await createCompatSubdirectory(input.tempRoot, input.caseId);
  const echo = await startEchoServer({ remoteClose: input.remoteClose === true });
  const listenPort = await allocateLoopbackPort();
  let running: RunningReference | undefined;
  let outbound: TrojanOutbound | undefined;
  try {
    const binaryPath = requiredBinaryPath(input.binary);
    const plan = await generateTrojanPlan({
      implementation: input.implementation,
      binaryPath,
      role: "server",
      directory: caseDir,
      listenPort,
      password: COMPAT_TEST_ONLY_PASSWORD,
      tls
    });
    const context = caseContext(input, plan, caseDir, startedAt, "outbound", "trojan");
    const launched = await launchReference(plan, caseDir);
    if (launched.status === "blocked") return completeCase(context, launched.result, launched.reason, launched.stop);
    running = launched.running;
    outbound = new TrojanOutbound({
      type: "trojan",
      tag: "reference",
      serverHost: COMPAT_LOOPBACK,
      serverPort: listenPort,
      password: input.password,
      tls: { enabled: true, serverName: tls.serverName, rejectUnauthorized: false }
    }, limits(), new Logger("silent"));
    const activeOutbound = outbound;
    await runSocketScenario(
      async () => (await activeOutbound.connect(proxyRequest(echo.port, input.caseId))).socket,
      input
    );
    const stop = await running.process.stop();
    running = undefined;
    return completeCase(
      context,
      lifecycleResult(stop),
      input.expectFailure === true
        ? "wrong password was rejected"
        : input.remoteClose === true
          ? "TLS remote close propagated and resources were released"
        : "TLS payload integrity passed; ephemeral self-signed chain validation disabled",
      stop
    );
  } catch (error) {
    const stop = running === undefined ? undefined : await running.process.stop();
    running = undefined;
    return failedCase(input, "outbound", "trojan", caseDir, startedAt, error, stop);
  } finally {
    if (running !== undefined) await running.process.stop();
    if (outbound !== undefined) await outbound.stop();
    await echo.close();
  }
};

const runTrojanClientCase = async (input: {
  readonly caseId: string;
  readonly implementation: TrojanImplementation;
  readonly binary: BinaryDetection | undefined;
  readonly payload: Buffer;
  readonly password: string;
  readonly tempRoot: string;
  readonly certificate: Awaited<ReturnType<typeof generateTestCertificate>>;
  readonly expectFailure?: boolean;
  readonly remoteClose?: boolean;
}): Promise<ExternalCompatibilityCase> => {
  const unavailable = unavailableTrojanCase(input, "inbound");
  if (unavailable !== undefined) return unavailable;
  const tls = input.certificate.tls as CompatTlsFiles;
  const startedAt = new Date().toISOString();
  const caseDir = await createCompatSubdirectory(input.tempRoot, input.caseId);
  const echo = await startEchoServer({ remoteClose: input.remoteClose === true });
  const engine = createTrojanEngine(COMPAT_TEST_ONLY_PASSWORD, tls);
  let running: RunningReference | undefined;
  try {
    await engine.start();
    const inboundPort = addressPort(engine.getInboundAddress("reference-in"));
    const localPort = await allocateLoopbackPort();
    const binaryPath = requiredBinaryPath(input.binary);
    const plan = await generateTrojanPlan({
      implementation: input.implementation,
      binaryPath,
      role: "client",
      directory: caseDir,
      listenPort: localPort,
      serverPort: inboundPort,
      password: input.password,
      tls
    });
    const context = caseContext(input, plan, caseDir, startedAt, "inbound", "trojan");
    const launched = await launchReference(plan, caseDir);
    if (launched.status === "blocked") return completeCase(context, launched.result, launched.reason, launched.stop);
    running = launched.running;
    if (input.expectFailure === true) {
      await expectSocksFailure(localPort, echo.port, input.payload);
    } else {
      await runSocketScenario(async () => await openSocksTunnel(localPort, echo.port), input);
    }
    const stop = await running.process.stop();
    running = undefined;
    return completeCase(
      context,
      lifecycleResult(stop),
      input.expectFailure === true
        ? "wrong password was rejected"
        : input.remoteClose === true
          ? "TLS remote close propagated and resources were released"
          : "TLS payload integrity passed",
      stop
    );
  } catch (error) {
    const stop = running === undefined ? undefined : await running.process.stop();
    running = undefined;
    return failedCase(input, "inbound", "trojan", caseDir, startedAt, error, stop);
  } finally {
    if (running !== undefined) await running.process.stop();
    await engine.stop();
    await echo.close();
  }
};

const generateShadowsocksPlan = async (input: ShadowsocksGeneratorInput & {
  readonly implementation: ShadowsocksImplementation;
}): Promise<ReferenceLaunchPlan> => {
  if (input.implementation === "shadowsocks-rust") return await generateShadowsocksRustConfig(input);
  if (input.implementation === "shadowsocks-libev") return generateShadowsocksLibevCommand(input);
  if (input.implementation === "sing-box") return await generateSingBoxShadowsocksConfig(input);
  return await generateXrayShadowsocksConfig(input);
};

const generateTrojanPlan = async (input: TrojanGeneratorInput & {
  readonly implementation: TrojanImplementation;
}): Promise<ReferenceLaunchPlan> => {
  if (input.implementation === "sing-box") return await generateSingBoxTrojanConfig(input);
  if (input.implementation === "xray") return await generateXrayTrojanConfig(input);
  return await generateTrojanGoConfig(input);
};

const launchReference = async (
  plan: ReferenceLaunchPlan,
  artifactDirectory: string
): Promise<ReferenceLaunchOutcome> => {
  const startup = await startExternalProcess({
    name: `${plan.implementation}-${plan.protocol}-${plan.role}`,
    command: plan.command,
    args: plan.args,
    artifactDirectory,
    startupTimeoutMs: PROCESS_START_TIMEOUT_MS,
    stopTimeoutMs: PROCESS_STOP_TIMEOUT_MS,
    maxLogBytes: PROCESS_LOG_LIMIT,
    cleanupPorts: [plan.listenPort],
    readiness: async () => await isTcpPortOpen(plan.listenPort)
  });
  if (startup.status === "ready") {
    return {
      status: "ready",
      running: { process: startup.process, plan },
      reason: startup.reason
    };
  }
  const stop = await startup.process.stop();
  return {
    status: "blocked",
    result: "blocked",
    reason: `reference launcher did not become ready: ${startup.reason}`,
    stop
  };
};

const unavailableCase = (
  input: {
    readonly caseId: string;
    readonly implementation: ReferenceImplementation;
    readonly binary: BinaryDetection | undefined;
    readonly payload: Buffer;
    readonly cipher?: ShadowsocksCipher;
    readonly concurrency?: number;
  },
  sepigsRole: "inbound" | "outbound",
  protocol: "shadowsocks" | "trojan"
): ExternalCompatibilityCase | undefined => {
  if (input.binary?.status === "available" && input.binary.path !== undefined) return undefined;
  const result: CompatibilityResult = input.binary === undefined || input.binary.status === "missing" ? "skipped" : "blocked";
  return {
    caseId: input.caseId,
    referenceImplementation: input.implementation,
    referenceVersion: input.binary?.versionOutput ?? "unknown",
    sepigsRole,
    protocol,
    ...(input.cipher === undefined ? {} : { cipher: input.cipher }),
    payloadSize: input.payload.byteLength,
    ...(input.concurrency === undefined ? {} : { concurrency: input.concurrency }),
    command: input.binary?.name ?? "missing",
    result,
    reason: input.binary === undefined
      ? "required reference binary was not detected"
      : `reference binary status is ${input.binary.status}${input.binary.error === undefined ? "" : `: ${input.binary.error}`}`,
    stdoutExcerpt: "",
    stderrExcerpt: "",
    reproductionCommand: `npm run compat:external:v1 -- --case ${input.caseId}`,
    artifactPath: "none",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };
};

const unavailableTrojanCase = (
  input: {
    readonly caseId: string;
    readonly implementation: TrojanImplementation;
    readonly binary: BinaryDetection | undefined;
    readonly payload: Buffer;
    readonly certificate: Awaited<ReturnType<typeof generateTestCertificate>>;
  },
  sepigsRole: "inbound" | "outbound"
): ExternalCompatibilityCase | undefined => {
  const unavailable = unavailableCase(input, sepigsRole, "trojan");
  if (unavailable !== undefined) return unavailable;
  if (input.certificate.status === "generated") return undefined;
  return {
    caseId: input.caseId,
    referenceImplementation: input.implementation,
    referenceVersion: input.binary?.versionOutput ?? "unknown",
    sepigsRole,
    protocol: "trojan",
    payloadSize: input.payload.byteLength,
    command: input.binary?.name ?? "missing",
    result: "blocked",
    reason: input.certificate.reason,
    stdoutExcerpt: "",
    stderrExcerpt: "",
    reproductionCommand: `npm run compat:external:v1 -- --case ${input.caseId}`,
    artifactPath: "none",
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString()
  };
};

const failedCase = (
  input: {
    readonly caseId: string;
    readonly implementation: ReferenceImplementation;
    readonly binary: BinaryDetection | undefined;
    readonly payload: Buffer;
    readonly cipher?: ShadowsocksCipher;
    readonly concurrency?: number;
  },
  sepigsRole: "inbound" | "outbound",
  protocol: "shadowsocks" | "trojan",
  caseDir: string,
  startedAt: string,
  error: unknown,
  stop: ExternalProcessStopResult | undefined
): ExternalCompatibilityCase => ({
  caseId: input.caseId,
  referenceImplementation: input.implementation,
  referenceVersion: input.binary?.versionOutput ?? "unknown",
  sepigsRole,
  protocol,
  ...(input.cipher === undefined ? {} : { cipher: input.cipher }),
  payloadSize: input.payload.byteLength,
  ...(input.concurrency === undefined ? {} : { concurrency: input.concurrency }),
  command: input.binary?.name ?? "unknown",
  result: "failed",
  reason: sanitizeEvidence(error instanceof Error ? error.message : String(error)),
  stdoutExcerpt: excerpt(stop?.stdout ?? ""),
  stderrExcerpt: excerpt(stop?.stderr ?? ""),
  reproductionCommand: `npm run compat:external:v1 -- --case ${input.caseId}`,
  artifactPath: compatArtifactLabel(caseDir),
  ...(stop === undefined ? {} : {
    processCleanup: {
      graceful: stop.graceful,
      forced: stop.forced,
      portsReleased: stop.portsReleased
    }
  }),
  startedAt,
  completedAt: new Date().toISOString()
});

const caseContext = (
  input: {
    readonly caseId: string;
    readonly implementation: ReferenceImplementation;
    readonly binary: BinaryDetection | undefined;
    readonly payload: Buffer;
    readonly cipher?: ShadowsocksCipher;
    readonly concurrency?: number;
  },
  plan: ReferenceLaunchPlan,
  caseDir: string,
  startedAt: string,
  sepigsRole: "inbound" | "outbound",
  protocol: "shadowsocks" | "trojan"
): CaseContext => ({
  caseId: input.caseId,
  implementation: input.implementation,
  version: input.binary?.versionOutput ?? "unknown",
  sepigsRole,
  protocol,
  payload: input.payload,
  ...(input.cipher === undefined ? {} : { cipher: input.cipher }),
  ...(input.concurrency === undefined ? {} : { concurrency: input.concurrency }),
  displayCommand: sanitizeEvidence(plan.displayCommand),
  artifactPath: compatArtifactLabel(caseDir),
  startedAt
});

const completeCase = (
  context: CaseContext,
  result: CompatibilityResult,
  reason: string,
  stop: ExternalProcessStopResult | undefined
): ExternalCompatibilityCase => ({
  caseId: context.caseId,
  referenceImplementation: context.implementation,
  referenceVersion: context.version,
  sepigsRole: context.sepigsRole,
  protocol: context.protocol,
  ...(context.cipher === undefined ? {} : { cipher: context.cipher }),
  payloadSize: context.payload.byteLength,
  ...(context.concurrency === undefined ? {} : { concurrency: context.concurrency }),
  command: context.displayCommand,
  result,
  reason: sanitizeEvidence(reason),
  stdoutExcerpt: excerpt(stop?.stdout ?? ""),
  stderrExcerpt: excerpt(stop?.stderr ?? ""),
  reproductionCommand: `npm run compat:external:v1 -- --case ${context.caseId}`,
  artifactPath: context.artifactPath,
  ...(stop === undefined ? {} : {
    processCleanup: {
      graceful: stop.graceful,
      forced: stop.forced,
      portsReleased: stop.portsReleased
    }
  }),
  startedAt: context.startedAt,
  completedAt: new Date().toISOString()
});

const lifecycleResult = (stop: ExternalProcessStopResult): CompatibilityResult =>
  stop.portsReleased ? "verified" : "failed";

const shadowsocksBinary = (
  report: ReferenceDetectionReport,
  implementation: ShadowsocksImplementation,
  role: "server" | "client"
): BinaryDetection | undefined => {
  const name = implementation === "shadowsocks-rust"
    ? role === "server" ? "ssserver" : "sslocal"
    : implementation === "shadowsocks-libev"
      ? role === "server" ? "ss-server" : "ss-local"
      : implementation;
  return findDetectedBinary(report, implementation, name);
};

const requiredBinaryPath = (binary: BinaryDetection | undefined): string => {
  if (binary?.status !== "available" || binary.path === undefined) {
    throw new Error("reference binary became unavailable after detection");
  }
  return binary.path;
};

const createShadowsocksEngine = (method: ShadowsocksCipher, password: string): Engine =>
  new Engine(parseConfig({
    log: { level: "silent" },
    limits: limits(),
    inbounds: [{
      type: "shadowsocks",
      tag: "reference-in",
      listen: COMPAT_LOOPBACK,
      port: 0,
      method,
      password,
      udp: false
    }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  }), new Logger("silent"));

const createTrojanEngine = (password: string, tls: CompatTlsFiles): Engine =>
  new Engine(parseConfig({
    log: { level: "silent" },
    limits: limits(),
    inbounds: [{
      type: "trojan",
      tag: "reference-in",
      listen: COMPAT_LOOPBACK,
      port: 0,
      password,
      tls: { enabled: true, certPath: tls.certificatePath, keyPath: tls.keyPath }
    }],
    outbounds: [{ type: "direct", tag: "direct" }],
    route: { defaultOutbound: "direct", rules: [] }
  }), new Logger("silent"));

const limits = () => ({
  connectTimeoutMs: 5_000,
  handshakeTimeoutMs: 5_000,
  idleTimeoutMs: 10_000,
  shutdownTimeoutMs: 2_000,
  maxHeaderBytes: 64 * 1024,
  maxConnections: 1_000,
  leakReportIntervalMs: 60_000
});

const proxyRequest = (port: number, id: string) => ({
  id,
  inboundTag: "compat-harness",
  protocol: "http" as const,
  network: "tcp" as const,
  destination: { host: COMPAT_LOOPBACK, port, addressType: "ipv4" as const },
  startedAt: Date.now()
});

const startEchoServer = async (
  options: { readonly remoteClose?: boolean } = {}
): Promise<{ readonly port: number; close(): Promise<void> }> => {
  const sockets = new Set<net.Socket>();
  const closeTimers = new Set<NodeJS.Timeout>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.once("close", () => {
      sockets.delete(socket);
      for (const timer of closeTimers) clearTimeout(timer);
      closeTimers.clear();
    });
    socket.on("error", () => undefined);
    if (options.remoteClose === true) {
      const timer = setTimeout(() => {
        closeTimers.delete(timer);
        socket.end();
      }, 100);
      timer.unref();
      closeTimers.add(timer);
    } else {
      socket.pipe(socket);
    }
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, COMPAT_LOOPBACK, () => {
      server.removeListener("error", reject);
      resolvePromise();
    });
  });
  const address = server.address();
  if (typeof address !== "object" || address === null) throw new Error("echo server failed to bind");
  return {
    port: address.port,
    close: async () => {
      for (const timer of closeTimers) clearTimeout(timer);
      closeTimers.clear();
      for (const socket of sockets) closeSocket(socket);
      await new Promise<void>((resolvePromise) => server.close(() => {
        resolvePromise();
      }));
    }
  };
};

const runSocketScenario = async (
  createSocket: () => Promise<TcpStream>,
  input: SocketScenarioInput
): Promise<void> => {
  const count = input.concurrency ?? 1;
  await Promise.all(Array.from({ length: count }, async () => {
    const socket = await createSocket();
    try {
      if (input.expectFailure === true) {
        await expectExchangeFailure(socket, input.payload);
      } else if (input.remoteClose === true) {
        await triggerRemoteClose(socket, input.payload);
      } else {
        await exchangeAndAssert(socket, input.payload);
      }
    } finally {
      closeSocket(socket);
    }
  }));
};

const triggerRemoteClose = async (socket: TcpStream, payload: Buffer): Promise<void> => {
  if (socket.destroyed) return;
  try {
    await writeWithBackpressure(socket, payload);
  } catch (error) {
    if (isExpectedCloseError(error)) return;
    throw error;
  }
  await waitForRemoteClose(socket);
};

const scenarioReason = (input: SocketScenarioInput): string => {
  if (input.expectFailure === true) return "wrong password was rejected";
  if (input.remoteClose === true) return "remote close propagated and resources were released";
  if ((input.concurrency ?? 1) > 1) return `${String(input.concurrency)} concurrent payload exchanges passed`;
  return "payload integrity passed";
};

const waitForRemoteClose = async (socket: TcpStream): Promise<void> => {
  if (socket.destroyed) return;
  await new Promise<void>((resolvePromise, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("close", onClose);
      socket.removeListener("error", onError);
    };
    const onClose = (): void => {
      cleanup();
      resolvePromise();
    };
    const onError = (error: Error): void => {
      cleanup();
      if (isExpectedCloseError(error)) {
        resolvePromise();
      } else {
        reject(error);
      }
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("timed out waiting for remote close"));
    }, 5_000);
    socket.once("close", onClose);
    socket.once("error", onError);
  });
};

const isExpectedCloseError = (error: unknown): boolean =>
  error instanceof Error && (error.message.includes("ECONNRESET") || error.message.includes("EPIPE"));

const exchangeAndAssert = async (socket: TcpStream, payload: Buffer): Promise<void> => {
  if (payload.byteLength > 64 * 1024) {
    await exchangeSinglePayload(socket, LARGE_PAYLOAD_WARMUP);
  }
  await exchangeSinglePayload(socket, payload);
};

const exchangeSinglePayload = async (socket: TcpStream, payload: Buffer): Promise<void> => {
  const responsePromise = readAtLeast(socket, payload.byteLength, 10_000);
  const [, response] = await Promise.all([writeWithBackpressure(socket, payload), responsePromise]);
  assert.deepEqual(response.subarray(0, payload.byteLength), payload);
};

const expectExchangeFailure = async (socket: TcpStream, payload: Buffer): Promise<void> => {
  try {
    const responsePromise = readAtLeast(socket, payload.byteLength, 3_000);
    const [, response] = await Promise.all([writeWithBackpressure(socket, payload), responsePromise]);
    if (response.subarray(0, payload.byteLength).equals(payload)) {
      throw new Error("wrong password unexpectedly relayed payload");
    }
  } catch (error) {
    if (error instanceof Error && error.message === "wrong password unexpectedly relayed payload") throw error;
  }
};

const writeWithBackpressure = async (socket: TcpStream, payload: Buffer): Promise<void> => {
  const chunkSize = 16 * 1024;
  for (let offset = 0; offset < payload.byteLength; offset += chunkSize) {
    const chunk = payload.subarray(offset, Math.min(payload.byteLength, offset + chunkSize));
    if (!socket.write(chunk)) {
      await waitForDrain(socket);
    }
  }
};

const waitForDrain = async (socket: TcpStream): Promise<void> => {
  await new Promise<void>((resolvePromise, reject) => {
    const cleanup = (): void => {
      socket.removeListener("drain", onDrain);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };
    const onDrain = (): void => {
      cleanup();
      resolvePromise();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error("socket closed while waiting for write backpressure"));
    };
    socket.once("drain", onDrain);
    socket.once("error", onError);
    socket.once("close", onClose);
  });
};

const openSocksTunnel = async (port: number, destinationPort: number): Promise<net.Socket> => {
  const socket = await connectSocket(port);
  socket.write(Buffer.from([0x05, 0x01, 0x00]));
  const greeting = await readAtLeast(socket, 2, 3_000);
  if (greeting[0] !== 0x05 || greeting[1] !== 0x00) {
    closeSocket(socket);
    throw new Error(`reference SOCKS client rejected no-auth greeting: ${greeting.toString("hex")}`);
  }
  const request = Buffer.from([
    0x05, 0x01, 0x00, 0x01,
    127, 0, 0, 1,
    (destinationPort >> 8) & 0xff,
    destinationPort & 0xff
  ]);
  socket.write(request);
  const response = await readAtLeast(socket, 10, 5_000);
  if (response[0] !== 0x05 || response[1] !== 0x00) {
    closeSocket(socket);
    throw new Error(`reference SOCKS client failed CONNECT with reply ${response.subarray(0, 10).toString("hex")}`);
  }
  return socket;
};

const expectSocksFailure = async (port: number, destinationPort: number, payload: Buffer): Promise<void> => {
  try {
    const socket = await openSocksTunnel(port, destinationPort);
    try {
      await exchangeAndAssert(socket, payload);
      throw new Error("wrong password unexpectedly relayed payload through reference client");
    } finally {
      closeSocket(socket);
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("unexpectedly relayed")) throw error;
  }
};

const connectSocket = async (port: number): Promise<net.Socket> =>
  await new Promise<net.Socket>((resolvePromise, reject) => {
    const socket = net.createConnection({ host: COMPAT_LOOPBACK, port });
    const onError = (error: Error): void => {
      socket.removeListener("connect", onConnect);
      reject(error);
    };
    const onConnect = (): void => {
      socket.removeListener("error", onError);
      resolvePromise(socket);
    };
    socket.once("error", onError);
    socket.once("connect", onConnect);
  });

const readAtLeast = async (socket: TcpStream, length: number, timeoutMs: number): Promise<Buffer> =>
  await new Promise<Buffer>((resolvePromise, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };
    const onData = (chunk: Buffer): void => {
      chunks.push(chunk);
      total += chunk.byteLength;
      if (total >= length) {
        cleanup();
        resolvePromise(Buffer.concat(chunks, total));
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error("socket closed before expected data arrived"));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for ${length} bytes`));
    }, timeoutMs);
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });

const addressPort = (address: ReturnType<Engine["getInboundAddress"]>): number => {
  if (typeof address !== "object" || address === null) throw new Error("sepigs inbound did not bind");
  return address.port;
};

const addUnsupportedCases = (
  cases: ExternalCompatibilityCase[],
  detection: ReferenceDetectionReport,
  caseFilter: string | undefined
): void => {
  for (const entry of [
    {
      caseId: "ss-udp-inbound-external",
      implementation: "sing-box" as const,
      protocol: "shadowsocks" as const,
      reason: "Shadowsocks UDP inbound certification is outside the current sepigs capability boundary"
    },
    {
      caseId: "trojan-public-plain-mode",
      implementation: "xray" as const,
      protocol: "trojan" as const,
      reason: "Trojan plaintext mode is a local fixture boundary and is not eligible for public interoperability verification"
    }
  ]) {
    if (!selected(entry.caseId, caseFilter)) continue;
    const binaryName = entry.implementation;
    const binary = findDetectedBinary(detection, entry.implementation, binaryName);
    cases.push({
      caseId: entry.caseId,
      referenceImplementation: entry.implementation,
      referenceVersion: binary?.versionOutput ?? "unknown",
      sepigsRole: "inbound",
      protocol: entry.protocol,
      payloadSize: 0,
      command: "not-run",
      result: "unsupported",
      reason: entry.reason,
      stdoutExcerpt: "",
      stderrExcerpt: "",
      reproductionCommand: `npm run compat:external:v1 -- --case ${entry.caseId}`,
      artifactPath: "none",
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString()
    });
  }
};

const selected = (caseId: string, filter: string | undefined): boolean =>
  filter === undefined || filter === caseId;

const sanitizeEvidence = (value: string): string =>
  redactCompatText(value).replaceAll(resolve(tmpdir()), "<system-temp>");

const excerpt = (value: string): string => sanitizeEvidence(value).trim().slice(0, 2_000);

const writeHarnessReport = async (report: HarnessReport): Promise<void> => {
  await mkdir("reports/compat", { recursive: true });
  await Promise.all([
    writeFile("reports/compat/external-v1.json", `${JSON.stringify(report, null, 2)}\n`, "utf8"),
    writeFile("reports/compat/external-v1.md", renderHarnessMarkdown(report), "utf8")
  ]);
};

const renderHarnessMarkdown = (report: HarnessReport): string => [
  "# External Compatibility Harness v1",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Platform: ${report.platform}`,
  `- Architecture: ${report.architecture}`,
  `- Summary: ${JSON.stringify(report.summary)}`,
  "",
  "| Case | Reference | Version | sepigs role | Protocol/cipher | Bytes | Result | Reason | Reproduction |",
  "| --- | --- | --- | --- | --- | ---: | --- | --- | --- |",
  ...report.cases.map((item) =>
    `| ${item.caseId} | ${item.referenceImplementation} | ${escapeCell(item.referenceVersion)} | ${item.sepigsRole} | ${item.protocol}${item.cipher === undefined ? "" : `/${item.cipher}`} | ${item.payloadSize} | ${item.result} | ${escapeCell(item.reason)} | \`${escapeCell(item.reproductionCommand)}\` |`
  ),
  "",
  "A blocked, skipped, or unsupported result is not a verified interoperability claim.",
  ""
].join("\n");

const escapeCell = (value: string): string => value.replaceAll("|", "\\|").replaceAll("\n", " ");

const parseCaseFilter = (): string | undefined => {
  const index = process.argv.indexOf("--case");
  return index < 0 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  const caseFilter = parseCaseFilter();
  const report = await runExternalCompatibilityHarness(caseFilter === undefined ? {} : { caseFilter });
  console.log(`external compatibility v1: ${JSON.stringify(report.summary)}`);
  if (report.summary.failed > 0) process.exitCode = 1;
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(`external compatibility harness failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
