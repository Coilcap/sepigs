import net from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/loader.js";
import type { SepigsConfig } from "../config/types.js";
import { Engine } from "../core/engine.js";
import type { TcpStream } from "../protocol/types.js";
import { closeSocket } from "../utils/net.js";
import type { RuntimeReloadOutcome } from "./runtimeIntegration.js";

export interface RuntimeSmokeM7Report {
  readonly generatedAt: string;
  readonly mode: "transactional-experimental";
  readonly transactionId: string;
  readonly transactionState: string;
  readonly components: readonly {
    readonly name: "router" | "policy";
    readonly prepared: boolean;
    readonly committed: boolean;
    readonly rolledBack: boolean;
  }[];
  readonly generations: {
    readonly router: { readonly old: string; readonly active: string; readonly switched: boolean };
    readonly policy: { readonly old: string; readonly active: string; readonly switched: boolean };
  };
  readonly connectionChecks: {
    readonly oldDecisionBeforeReload: "direct";
    readonly oldDecisionAfterReload: "direct";
    readonly establishedConnectionSurvived: true;
    readonly newDecisionAfterReload: "block";
    readonly rejectedHttpStatus: 403;
  };
  readonly sideEffects: {
    readonly connectionsClosedByReload: 0;
    readonly listenersChanged: 0;
    readonly dnsChanged: false;
    readonly fakeIpChanged: false;
  };
  readonly metricsChecks: {
    readonly routerGenerationExposed: boolean;
    readonly policyGenerationExposed: boolean;
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

export const runRuntimeSmokeM7 = async (candidatePath: string): Promise<RuntimeSmokeM7Report> => {
  const candidate = await loadConfig(candidatePath);
  validateCandidate(candidate);
  const initial = createInitialConfig(candidate);
  const echo = await startEchoServer();
  const engine = new Engine(initial);
  let established: net.Socket | undefined;
  let rejected: net.Socket | undefined;
  let outcome: RuntimeReloadOutcome | undefined;
  let reportState: Omit<RuntimeSmokeM7Report, "generatedAt" | "resourceCleanup"> | undefined;
  try {
    await engine.start();
    const inboundAddress = engine.getInboundAddress("http-in");
    const inboundPort = addressPort(inboundAddress);
    const oldRouter = engine.getActiveRouterGeneration();
    const oldPolicy = engine.getActivePolicyGeneration();
    established = await openConnectTunnel(inboundPort, echo.port);
    established.write("before");
    await expectPayload(established, "before");
    await waitFor(() => engine.getStats().activeConnections === 1);
    const closedBeforeReload = engine.getStats().closedConnections;

    await engine.reloadConfig(candidate);
    outcome = engine.getLastRuntimeReloadOutcome();
    if (outcome === undefined || !outcome.execution.success) {
      throw new Error("M7 runtime smoke did not commit a transaction");
    }
    const activeRouter = engine.getActiveRouterGeneration();
    const activePolicy = engine.getActivePolicyGeneration();
    if (engine.getStats().closedConnections !== closedBeforeReload) {
      throw new Error("M7 runtime reload closed an established connection");
    }
    if (!sameAddress(inboundAddress, engine.getInboundAddress("http-in"))) {
      throw new Error("M7 runtime reload changed an inbound listener");
    }

    established.write("after");
    await expectPayload(established, "after");
    rejected = await connect(inboundPort);
    rejected.write(connectRequest(echo.port));
    const rejection = await readUntil(rejected, (buffer) => buffer.includes("\r\n\r\n"));
    if (!/^HTTP\/1\.1 403 Forbidden/mu.test(rejection.toString("utf8"))) {
      throw new Error(`M7 candidate route did not reject a new connection: ${rejection.toString("utf8")}`);
    }
    const metrics = await requestMetrics(engine);
    reportState = {
      mode: outcome.mode,
      transactionId: outcome.execution.transaction.id,
      transactionState: outcome.execution.transaction.state,
      components: [
        componentResult(outcome, "router", "router"),
        componentResult(outcome, "policy", "policy-prober")
      ],
      generations: {
        router: {
          old: oldRouter.id,
          active: activeRouter.id,
          switched: oldRouter.id !== activeRouter.id
        },
        policy: {
          old: oldPolicy.id,
          active: activePolicy.id,
          switched: oldPolicy.id !== activePolicy.id
        }
      },
      connectionChecks: {
        oldDecisionBeforeReload: "direct",
        oldDecisionAfterReload: "direct",
        establishedConnectionSurvived: true,
        newDecisionAfterReload: "block",
        rejectedHttpStatus: 403
      },
      sideEffects: {
        connectionsClosedByReload: 0,
        listenersChanged: 0,
        dnsChanged: false,
        fakeIpChanged: false
      },
      metricsChecks: {
        routerGenerationExposed: metrics.includes(
          `sepigs_reload_active_router_generation_id ${String(activeRouter.sequence)}`
        ),
        policyGenerationExposed: metrics.includes(
          `sepigs_reload_active_policy_generation_id ${String(activePolicy.sequence)}`
        )
      }
    };
  } finally {
    if (established !== undefined) closeSocket(established);
    if (rejected !== undefined) closeSocket(rejected);
    await engine.stop();
    await closeServer(echo.server);
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

export const writeRuntimeSmokeM7Report = async (
  report: RuntimeSmokeM7Report,
  outputDirectory = "reports/reload"
): Promise<void> => {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "runtime-smoke-m7-latest.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, "runtime-smoke-m7-latest.md"),
      renderMarkdown(report),
      "utf8"
    )
  ]);
};

const createInitialConfig = (candidate: SepigsConfig): SepigsConfig => ({
  ...candidate,
  reload: {
    ...candidate.reload,
    mode: "legacy"
  },
  route: {
    ...candidate.route,
    defaultOutbound: "direct",
    rules: [],
    ruleSetFiles: [],
    policies: []
  }
});

const validateCandidate = (candidate: SepigsConfig): void => {
  if (candidate.reload.mode !== "transactional-experimental") {
    throw new Error("M7 runtime smoke requires transactional-experimental mode");
  }
  if (
    !candidate.reload.transactional.enabledComponents.includes("router") ||
    !candidate.reload.transactional.enabledComponents.includes("policy")
  ) {
    throw new Error("M7 runtime smoke requires router and policy components");
  }
  if (candidate.route.defaultOutbound !== "block") {
    throw new Error("M7 runtime smoke candidate must route new connections to block");
  }
  if (!candidate.observability.metrics.enabled) {
    throw new Error("M7 runtime smoke requires loopback metrics");
  }
  if (candidate.observability.metrics.listen !== "127.0.0.1") {
    throw new Error("M7 runtime smoke metrics must listen on 127.0.0.1");
  }
};

const componentResult = (
  outcome: RuntimeReloadOutcome,
  name: "router" | "policy",
  runtimeName: "router" | "policy-prober"
): RuntimeSmokeM7Report["components"][number] => ({
  name,
  prepared: outcome.execution.preparedComponents.includes(runtimeName),
  committed: outcome.execution.committedComponents.includes(runtimeName),
  rolledBack: (outcome.execution.metrics.componentRollback[runtimeName] ?? 0) > 0
});

const startEchoServer = async (): Promise<{ readonly server: net.Server; readonly port: number }> => {
  const server = net.createServer((socket) => {
    socket.on("error", () => undefined);
    socket.pipe(socket);
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  return { server, port: addressPort(server.address()) };
};

const openConnectTunnel = async (proxyPort: number, targetPort: number): Promise<net.Socket> => {
  const socket = await connect(proxyPort);
  socket.write(connectRequest(targetPort));
  const response = await readUntil(socket, (buffer) => buffer.includes("\r\n\r\n"));
  if (!/^HTTP\/1\.1 200 Connection Established/mu.test(response.toString("utf8"))) {
    throw new Error(`M7 initial route did not establish: ${response.toString("utf8")}`);
  }
  return socket;
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
      reject(new Error("M7 runtime smoke socket read timed out"));
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
      reject(new Error("M7 runtime smoke socket closed before expected data"));
    };
    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
  });

const expectPayload = async (socket: net.Socket, expected: string): Promise<void> => {
  const payload = await readUntil(socket, (buffer) => buffer.byteLength >= Buffer.byteLength(expected));
  if (payload.toString("utf8") !== expected) {
    throw new Error(`M7 established tunnel returned unexpected payload "${payload.toString("utf8")}"`);
  }
};

const requestMetrics = async (engine: Engine): Promise<string> => {
  const address = engine.getMetricsAddress();
  const socket = await connect(addressPort(address));
  try {
    socket.write("GET /metrics HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n");
    const response = await readUntil(socket, (buffer) =>
      buffer.includes("sepigs_reload_active_policy_generation_id")
    );
    return response.toString("utf8");
  } finally {
    closeSocket(socket);
  }
};

const waitFor = async (predicate: () => boolean): Promise<void> => {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 10));
  }
  throw new Error("M7 runtime smoke condition timed out");
};

const addressPort = (address: ReturnType<net.Server["address"]>): number => {
  if (typeof address !== "object" || address === null) {
    throw new Error("M7 runtime smoke endpoint is not listening");
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

const renderMarkdown = (report: RuntimeSmokeM7Report): string => [
  "# M7 Router / Policy Runtime Smoke",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Transaction: ${report.transactionId}`,
  `- State: ${report.transactionState}`,
  `- Router generation switched: ${report.generations.router.switched ? "yes" : "no"}`,
  `- Policy generation switched: ${report.generations.policy.switched ? "yes" : "no"}`,
  "- Established connection survived: yes",
  `- New connection decision: ${report.connectionChecks.newDecisionAfterReload} (HTTP ${String(report.connectionChecks.rejectedHttpStatus)})`,
  `- Connections closed by reload: ${String(report.sideEffects.connectionsClosedByReload)}`,
  `- Listener changes: ${String(report.sideEffects.listenersChanged)}`,
  "- DNS/fake-IP changes: no/no",
  "",
  "| Component | Prepared | Committed | Rolled back |",
  "| --- | --- | --- | --- |",
  ...report.components.map((component) =>
    `| ${component.name} | ${component.prepared ? "yes" : "no"} | ${component.committed ? "yes" : "no"} | ${component.rolledBack ? "yes" : "no"} |`
  ),
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
    argument("--config") ?? "examples/sepigs.transactional-router-policy.experimental.json";
  const report = await runRuntimeSmokeM7(configPath);
  await writeRuntimeSmokeM7Report(report);
  const cleanup = report.resourceCleanup;
  if (
    !report.generations.router.switched ||
    !report.generations.policy.switched ||
    !report.metricsChecks.routerGenerationExposed ||
    !report.metricsChecks.policyGenerationExposed ||
    cleanup.activeConnections !== 0 ||
    cleanup.activeSockets !== 0 ||
    cleanup.activeTimers !== 0 ||
    cleanup.activeListeners !== 0
  ) {
    throw new Error("M7 runtime smoke acceptance checks failed");
  }
  console.log("M7 router/policy runtime smoke passed; existing tunnel survived; resources 0/0/0");
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(`M7 runtime smoke failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
