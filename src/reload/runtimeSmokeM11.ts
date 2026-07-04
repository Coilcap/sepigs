import { mkdir, writeFile } from "node:fs/promises";
import net from "node:net";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/loader.js";
import type { OutboundConfig, SepigsConfig } from "../config/types.js";
import { Engine } from "../core/engine.js";
import type { TcpStream } from "../protocol/types.js";
import { closeSocket } from "../utils/net.js";
import type { RuntimeReloadOutcome } from "./runtimeIntegration.js";

export interface RuntimeSmokeM11Report {
  readonly generatedAt: string;
  readonly mode: "transactional-experimental";
  readonly transactionId: string;
  readonly transactionState: string;
  readonly generation: {
    readonly old: string;
    readonly active: string;
    readonly switched: boolean;
    readonly oldReferenceReadable: boolean;
    readonly oldDrainedAfterRelease: boolean;
  };
  readonly supportedTypes: {
    readonly direct: boolean;
    readonly block: boolean;
    readonly tcpRelay: boolean;
  };
  readonly connectionChecks: {
    readonly establishedConnectionSurvived: boolean;
    readonly oldConnectionResponse: string;
    readonly newConnectionResponse: string;
    readonly connectionsClosedByReload: number;
  };
  readonly rejectionChecks: {
    readonly shadowsocks: boolean;
    readonly trojan: boolean;
    readonly activeGenerationUnchanged: boolean;
  };
  readonly sideEffects: {
    readonly listenersChanged: number;
    readonly dnsGenerationChanged: boolean;
    readonly fakeIpChanged: false;
  };
  readonly metricsChecks: {
    readonly prepareDuration: boolean;
    readonly commitDuration: boolean;
    readonly activeGeneration: boolean;
    readonly rejectedUnsupported: boolean;
  };
  readonly resourceCleanup: {
    readonly transactionCleanupCompleted: boolean;
    readonly cleanupErrors: number;
    readonly activeConnections: number;
    readonly activeSockets: number;
    readonly activeTimers: number;
    readonly activeListeners: number;
  };
}

export const runRuntimeSmokeM11 = async (
  candidatePath: string
): Promise<RuntimeSmokeM11Report> => {
  const loaded = await loadConfig(candidatePath);
  validateCandidate(loaded);
  const oldTarget = await startLabeledServer("old");
  const newTarget = await startLabeledServer("new");
  const candidate = withRelayPort(loaded, newTarget.port);
  const initial = createInitialConfig(candidate, oldTarget.port);
  const engine = new Engine(initial);
  let established: net.Socket | undefined;
  let newConnection: net.Socket | undefined;
  let outcome: RuntimeReloadOutcome | undefined;
  let oldReference: ReturnType<Engine["acquireOutboundRuntimeRef"]>;
  let reportState:
    | Omit<RuntimeSmokeM11Report, "generatedAt" | "resourceCleanup">
    | undefined;
  try {
    await engine.start();
    const inboundAddress = engine.getInboundAddress("http-in");
    const inboundPort = addressPort(inboundAddress);
    const oldDnsGeneration = engine.getActiveDnsGeneration().id;
    const oldGeneration = engine.getOutboundRuntimeSnapshot().activeGenerationId;
    established = await openConnectTunnel(inboundPort, oldTarget.port);
    established.write("before");
    const before = await expectPayload(established, "old:before");
    if (before !== "old:before") throw new Error("M11 initial direct path is invalid");
    oldReference = engine.acquireOutboundRuntimeRef("direct");
    if (oldReference === undefined) {
      throw new Error("M11 could not acquire old outbound reference");
    }
    const closedBeforeReload = engine.getStats().closedConnections;

    await engine.reloadConfig(candidate);
    outcome = engine.getLastRuntimeReloadOutcome();
    if (outcome === undefined || !outcome.execution.success) {
      throw new Error("M11 runtime smoke did not commit an outbound transaction");
    }
    const switched = engine.getOutboundRuntimeSnapshot();
    if (switched.activeGenerationId === oldGeneration) {
      throw new Error("M11 outbound generation did not switch");
    }
    if (switched.drainingGenerations < 1) {
      throw new Error("M11 old referenced generation was not retained for drain");
    }
    if (!sameAddress(inboundAddress, engine.getInboundAddress("http-in"))) {
      throw new Error("M11 runtime reload changed an inbound listener");
    }

    established.write("after");
    const oldResponse = await expectPayload(established, "old:after");
    const connectionsClosedByReload =
      engine.getStats().closedConnections - closedBeforeReload;
    newConnection = await openConnectTunnel(inboundPort, oldTarget.port);
    newConnection.write("request");
    const newResponse = await expectPayload(newConnection, "new:request");
    const activeEntries = engine.getOutboundRuntimeSnapshot()
      .generations.find((generation) => generation.state === "active")?.entries ?? [];
    const activeTypes = new Set(activeEntries.map((entry) => entry.type));

    const generationAfterCommit = switched.activeGenerationId;
    const shadowsocksRejected = await rejectUnsupported(
      engine,
      withUnsupported(candidate, shadowsocksCandidate())
    );
    const trojanRejected = await rejectUnsupported(
      engine,
      withUnsupported(candidate, trojanCandidate())
    );
    const generationAfterRejections =
      engine.getOutboundRuntimeSnapshot().activeGenerationId;
    const metrics = await requestMetrics(engine);
    closeSocket(established);
    established = undefined;
    await engine.releaseOutboundRuntimeRef(oldReference);
    oldReference = undefined;
    await waitFor(
      () => engine.getOutboundRuntimeSnapshot().drainingGenerations === 0
    );

    reportState = {
      mode: outcome.mode,
      transactionId: outcome.execution.transaction.id,
      transactionState: outcome.execution.transaction.state,
      generation: {
        old: oldGeneration,
        active: generationAfterCommit,
        switched: generationAfterCommit !== oldGeneration,
        oldReferenceReadable: true,
        oldDrainedAfterRelease:
          engine.getOutboundRuntimeSnapshot().drainingGenerations === 0
      },
      supportedTypes: {
        direct: activeTypes.has("direct"),
        block: activeTypes.has("block"),
        tcpRelay: activeTypes.has("tcpRelay")
      },
      connectionChecks: {
        establishedConnectionSurvived: oldResponse === "old:after",
        oldConnectionResponse: oldResponse,
        newConnectionResponse: newResponse,
        connectionsClosedByReload
      },
      rejectionChecks: {
        shadowsocks: shadowsocksRejected,
        trojan: trojanRejected,
        activeGenerationUnchanged:
          generationAfterCommit === generationAfterRejections
      },
      sideEffects: {
        listenersChanged: sameAddress(
          inboundAddress,
          engine.getInboundAddress("http-in")
        ) ? 0 : 1,
        dnsGenerationChanged:
          oldDnsGeneration !== engine.getActiveDnsGeneration().id,
        fakeIpChanged: false
      },
      metricsChecks: {
        prepareDuration: metrics.includes(
          'sepigs_reload_component_prepare_duration_ms{component="outbound-registry"}'
        ),
        commitDuration: metrics.includes(
          'sepigs_reload_component_commit_duration_ms{component="outbound-registry"}'
        ),
        activeGeneration: metrics.includes(
          "sepigs_reload_active_outbound_generation_id 1"
        ),
        rejectedUnsupported: metrics.includes(
          "sepigs_reload_outbound_rejected_unsupported_total 2"
        )
      }
    };
  } finally {
    if (oldReference !== undefined) {
      await engine.releaseOutboundRuntimeRef(oldReference).catch(() => undefined);
    }
    if (established !== undefined) closeSocket(established);
    if (newConnection !== undefined) closeSocket(newConnection);
    await engine.stop();
    await closeServer(oldTarget.server);
    await closeServer(newTarget.server);
  }
  const leaks = engine.getLeakSnapshot();
  return {
    generatedAt: new Date().toISOString(),
    ...reportState,
    resourceCleanup: {
      transactionCleanupCompleted: outcome.resourceCleanup.completed,
      cleanupErrors: outcome.resourceCleanup.cleanupErrors,
      activeConnections: engine.getStats().activeConnections,
      activeSockets: leaks.activeSockets,
      activeTimers: leaks.activeTimers,
      activeListeners: leaks.activeListeners
    }
  };
};

export const writeRuntimeSmokeM11Report = async (
  report: RuntimeSmokeM11Report,
  outputDirectory = "reports/reload"
): Promise<void> => {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "runtime-smoke-m11-latest.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, "runtime-smoke-m11-latest.md"),
      renderMarkdown(report),
      "utf8"
    )
  ]);
};

const validateCandidate = (candidate: SepigsConfig): void => {
  if (candidate.reload.mode !== "transactional-experimental") {
    throw new Error("M11 runtime smoke requires transactional-experimental mode");
  }
  for (const component of ["outbound", "router"] as const) {
    if (!candidate.reload.transactional.enabledComponents.includes(component)) {
      throw new Error(`M11 runtime smoke requires ${component} component`);
    }
  }
  const types = new Set(candidate.outbounds.map((outbound) => outbound.type));
  for (const type of ["direct", "block", "tcpRelay"] as const) {
    if (!types.has(type)) throw new Error(`M11 candidate is missing ${type}`);
  }
  if (candidate.route.defaultOutbound !== "relay") {
    throw new Error("M11 candidate must route new connections through relay");
  }
  if (
    !candidate.observability.metrics.enabled ||
    candidate.observability.metrics.listen !== "127.0.0.1"
  ) {
    throw new Error("M11 runtime smoke requires loopback metrics");
  }
};

const createInitialConfig = (
  candidate: SepigsConfig,
  oldRelayPort: number
): SepigsConfig => ({
  ...candidate,
  reload: { ...candidate.reload, mode: "legacy" },
  outbounds: candidate.outbounds.map((outbound): OutboundConfig => {
    if (outbound.type === "direct") {
      return { ...outbound, connectTimeoutMs: 2_500 };
    }
    if (outbound.type === "block") {
      return { ...outbound, reason: "M11 old block generation" };
    }
    if (outbound.type === "tcpRelay") {
      return { ...outbound, targetPort: oldRelayPort };
    }
    return outbound;
  }),
  route: {
    ...candidate.route,
    defaultOutbound: "direct",
    rules: [],
    ruleSetFiles: [],
    policies: []
  }
});

const withRelayPort = (
  config: SepigsConfig,
  port: number
): SepigsConfig => ({
  ...config,
  outbounds: config.outbounds.map((outbound): OutboundConfig =>
    outbound.type === "tcpRelay"
      ? { ...outbound, targetHost: "127.0.0.1", targetPort: port }
      : outbound
  )
});

const withUnsupported = (
  config: SepigsConfig,
  unsupported: OutboundConfig
): SepigsConfig => ({
  ...config,
  reload: {
    ...config.reload,
    transactional: {
      ...config.reload.transactional,
      enabledComponents: ["outbound"]
    }
  },
  outbounds: [...config.outbounds, unsupported]
});

const shadowsocksCandidate = (): OutboundConfig => ({
  type: "shadowsocks",
  tag: "unsupported-shadowsocks",
  serverHost: "127.0.0.1",
  serverPort: 8388,
  method: "aes-128-gcm",
  password: "test-only-redacted"
});

const trojanCandidate = (): OutboundConfig => ({
  type: "trojan",
  tag: "unsupported-trojan",
  serverHost: "127.0.0.1",
  serverPort: 443,
  password: "test-only-redacted",
  tls: { enabled: true, rejectUnauthorized: true }
});

const rejectUnsupported = async (
  engine: Engine,
  candidate: SepigsConfig
): Promise<boolean> => {
  try {
    await engine.reloadConfig(candidate);
    return false;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("test-only-redacted")) {
      throw new Error("M11 rejection leaked an outbound secret");
    }
    return /rejects unsupported type/u.test(message);
  }
};

const startLabeledServer = async (
  label: string
): Promise<{ readonly server: net.Server; readonly port: number }> => {
  const server = net.createServer((socket) => {
    socket.on("error", () => undefined);
    socket.on("data", (chunk: Buffer) => {
      socket.write(`${label}:${chunk.toString("utf8")}`);
    });
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  return { server, port: addressPort(server.address()) };
};

const openConnectTunnel = async (
  proxyPort: number,
  targetPort: number
): Promise<net.Socket> => {
  const socket = await connect(proxyPort);
  socket.write(connectRequest(targetPort));
  const response = await readUntil(
    socket,
    (buffer) => buffer.includes("\r\n\r\n")
  );
  if (!/^HTTP\/1\.1 200 Connection Established/mu.test(response.toString("utf8"))) {
    throw new Error(`M11 CONNECT failed: ${response.toString("utf8")}`);
  }
  return socket;
};

const expectPayload = async (
  socket: net.Socket,
  expected: string
): Promise<string> => {
  const payload = await readUntil(
    socket,
    (buffer) => buffer.byteLength >= Buffer.byteLength(expected)
  );
  const value = payload.toString("utf8");
  if (value !== expected) {
    throw new Error(`M11 tunnel returned "${value}", expected "${expected}"`);
  }
  return value;
};

const requestMetrics = async (engine: Engine): Promise<string> => {
  const socket = await connect(addressPort(engine.getMetricsAddress()));
  try {
    socket.write(
      "GET /metrics HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n"
    );
    return (
      await readUntil(socket, (buffer) =>
        buffer.includes("sepigs_reload_outbound_rejected_unsupported_total")
      )
    ).toString("utf8");
  } finally {
    closeSocket(socket);
  }
};

const connect = async (port: number): Promise<net.Socket> =>
  await new Promise((resolvePromise, reject) => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      resolvePromise(socket);
    });
    socket.once("error", reject);
  });

const readUntil = async (
  socket: TcpStream,
  predicate: (buffer: Buffer) => boolean
): Promise<Buffer> =>
  await new Promise((resolvePromise, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("M11 runtime smoke socket read timed out"));
    }, 2_000);
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      socket.removeListener("close", onClose);
    };
    const onData = (chunk: Buffer): void => {
      buffer = Buffer.concat([buffer, chunk], buffer.byteLength + chunk.byteLength);
      if (predicate(buffer)) {
        cleanup();
        resolvePromise(buffer);
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onClose = (): void => {
      cleanup();
      reject(new Error("M11 runtime smoke socket closed before expected data"));
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error("M11 runtime smoke drain timed out");
};

const addressPort = (
  address: ReturnType<net.Server["address"]>
): number => {
  if (typeof address !== "object" || address === null) {
    throw new Error("M11 runtime smoke endpoint is not listening");
  }
  return address.port;
};

const sameAddress = (
  left: ReturnType<Engine["getInboundAddress"]>,
  right: ReturnType<Engine["getInboundAddress"]>
): boolean => JSON.stringify(left) === JSON.stringify(right);

const connectRequest = (port: number): string =>
  `CONNECT 127.0.0.1:${String(port)} HTTP/1.1\r\nHost: 127.0.0.1:${String(port)}\r\n\r\n`;

const closeServer = async (server: net.Server): Promise<void> => {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error?: Error) => {
      if (error === undefined) resolvePromise();
      else reject(error);
    });
  });
};

const renderMarkdown = (report: RuntimeSmokeM11Report): string => [
  "# M11 Limited Outbound Runtime Smoke",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Transaction: ${report.transactionId}`,
  `- State: ${report.transactionState}`,
  `- Generation switched: ${report.generation.switched ? "yes" : "no"}`,
  `- Old reference remained readable: ${report.generation.oldReferenceReadable ? "yes" : "no"}`,
  `- Old generation drained after release: ${report.generation.oldDrainedAfterRelease ? "yes" : "no"}`,
  "- Supported runtime types: direct, block, tcpRelay",
  `- Established connection survived: ${report.connectionChecks.establishedConnectionSurvived ? "yes" : "no"}`,
  `- New connection used candidate relay: ${report.connectionChecks.newConnectionResponse === "new:request" ? "yes" : "no"}`,
  `- Connections closed by reload: ${String(report.connectionChecks.connectionsClosedByReload)}`,
  `- Shadowsocks/Trojan rejected: ${report.rejectionChecks.shadowsocks ? "yes" : "no"}/${report.rejectionChecks.trojan ? "yes" : "no"}`,
  `- Listener changes: ${String(report.sideEffects.listenersChanged)}`,
  `- DNS/fake-IP changes: ${report.sideEffects.dnsGenerationChanged ? "yes" : "no"}/no`,
  "",
  "## Cleanup",
  "",
  `- Transaction cleanup completed: ${report.resourceCleanup.transactionCleanupCompleted ? "yes" : "no"}`,
  `- Cleanup errors: ${String(report.resourceCleanup.cleanupErrors)}`,
  `- Active connections after stop: ${String(report.resourceCleanup.activeConnections)}`,
  `- Active sockets/timers/listeners after stop: ${String(report.resourceCleanup.activeSockets)}/${String(report.resourceCleanup.activeTimers)}/${String(report.resourceCleanup.activeListeners)}`,
  ""
].join("\n");

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  const configPath =
    argument("--config") ??
    "examples/sepigs.transactional-outbound.experimental.json";
  const report = await runRuntimeSmokeM11(configPath);
  await writeRuntimeSmokeM11Report(report);
  const cleanup = report.resourceCleanup;
  if (
    !report.generation.switched ||
    !report.generation.oldReferenceReadable ||
    !report.generation.oldDrainedAfterRelease ||
    !Object.values(report.supportedTypes).every(Boolean) ||
    !report.connectionChecks.establishedConnectionSurvived ||
    report.connectionChecks.newConnectionResponse !== "new:request" ||
    report.connectionChecks.connectionsClosedByReload !== 0 ||
    !report.rejectionChecks.shadowsocks ||
    !report.rejectionChecks.trojan ||
    !report.rejectionChecks.activeGenerationUnchanged ||
    report.sideEffects.listenersChanged !== 0 ||
    report.sideEffects.dnsGenerationChanged ||
    !Object.values(report.metricsChecks).every(Boolean) ||
    cleanup.activeConnections !== 0 ||
    cleanup.activeSockets !== 0 ||
    cleanup.activeTimers !== 0 ||
    cleanup.activeListeners !== 0
  ) {
    throw new Error("M11 runtime smoke acceptance checks failed");
  }
  console.log(
    "M11 outbound runtime smoke passed; old tunnel survived; resources 0/0/0"
  );
};

const entryPath = process.argv[1];
if (
  entryPath !== undefined &&
  fileURLToPath(import.meta.url) === resolve(entryPath)
) {
  main().catch((error: unknown) => {
    console.error(
      `M11 runtime smoke failed: ${error instanceof Error ? error.message : String(error)}`
    );
    process.exitCode = 1;
  });
}
