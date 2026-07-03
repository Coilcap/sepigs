import dgram from "node:dgram";
import net from "node:net";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config/loader.js";
import type { SepigsConfig } from "../config/types.js";
import { Engine } from "../core/engine.js";
import type { TcpStream } from "../protocol/types.js";
import { closeSocket } from "../utils/net.js";

export interface RuntimeSmokeDnsReport {
  readonly generatedAt: string;
  readonly transactionState: string;
  readonly generation: {
    readonly old: string;
    readonly active: string;
    readonly switched: boolean;
    readonly drainingAfterOldCompletion: number;
  };
  readonly queryChecks: {
    readonly cachedBeforeReload: string;
    readonly oldInFlightResult: string;
    readonly newGenerationResult: string;
    readonly crossGenerationMerged: false;
  };
  readonly cachePolicy: {
    readonly carried: number;
    readonly dropped: number;
  };
  readonly fakeIpChange: {
    readonly rejected: true;
    readonly activeGenerationUnchanged: true;
    readonly rejectionCount: number;
  };
  readonly existingConnection: {
    readonly survivedReload: true;
    readonly connectionsClosedByReload: 0;
  };
  readonly sideEffects: {
    readonly listenersChanged: 0;
    readonly fakeIpChanged: false;
  };
  readonly resources: {
    readonly activeConnections: number;
    readonly activeSockets: number;
    readonly activeTimers: number;
    readonly activeListeners: number;
  };
}

export const runRuntimeSmokeDns = async (
  configPath: string
): Promise<RuntimeSmokeDnsReport> => {
  const loaded = await loadConfig(configPath);
  validateCandidate(loaded);
  const oldDns = await startDnsServer("192.0.2.10", 80);
  const newDns = await startDnsServer("192.0.2.20", 0);
  const echo = await startEchoServer();
  const candidate = withDnsServer(loaded, "candidate-local", newDns.port);
  const initial = createInitialConfig(candidate, oldDns.port);
  const engine = new Engine(initial);
  let tunnel: net.Socket | undefined;
  let reportState: Omit<RuntimeSmokeDnsReport, "generatedAt" | "resources"> | undefined;
  try {
    await engine.start();
    const inboundAddress = engine.getInboundAddress("http-in");
    const inboundPort = addressPort(inboundAddress);
    tunnel = await openConnectTunnel(inboundPort, echo.port);
    tunnel.write("before");
    await expectPayload(tunnel, "before");
    await waitFor(() => engine.getStats().activeConnections === 1);

    const cachedBeforeReload = await engine.resolveDns("cached.test");
    const oldGeneration = engine.getActiveDnsGeneration();
    const oldQuery = engine.resolveDns("inflight.test");
    await waitFor(() => oldDns.queries() === 2);
    const closedBefore = engine.getStats().closedConnections;

    await engine.reloadConfig(candidate);
    const outcome = engine.getLastRuntimeReloadOutcome();
    if (outcome === undefined || !outcome.execution.success) {
      throw new Error("DNS runtime smoke did not commit");
    }
    const activeGeneration = engine.getActiveDnsGeneration();
    const newQuery = await engine.resolveDns("inflight.test");
    const oldResult = await oldQuery;
    await waitFor(() => engine.getActiveDnsGeneration().drainingGenerations === 0);

    tunnel.write("after");
    await expectPayload(tunnel, "after");
    if (engine.getStats().closedConnections !== closedBefore) {
      throw new Error("DNS reload closed an established connection");
    }
    if (!sameAddress(inboundAddress, engine.getInboundAddress("http-in"))) {
      throw new Error("DNS reload changed an inbound listener");
    }

    const beforeRejected = engine.getActiveDnsGeneration();
    let fakeIpRejected = false;
    try {
      await engine.reloadConfig(withFakeIpEnabled(candidate));
    } catch (error) {
      fakeIpRejected =
        error instanceof Error && /fake-IP configuration change/u.test(error.message);
    }
    if (!fakeIpRejected) throw new Error("DNS reload did not reject fake-IP change");
    const afterRejected = engine.getActiveDnsGeneration();
    if (beforeRejected.id !== afterRejected.id) {
      throw new Error("fake-IP rejection changed active DNS generation");
    }
    const dnsMetrics = engine.getDnsReloadMetricsSnapshot();
    reportState = {
      transactionState: outcome.execution.transaction.state,
      generation: {
        old: oldGeneration.id,
        active: activeGeneration.id,
        switched: oldGeneration.id !== activeGeneration.id,
        drainingAfterOldCompletion: engine.getActiveDnsGeneration().drainingGenerations
      },
      queryChecks: {
        cachedBeforeReload,
        oldInFlightResult: oldResult,
        newGenerationResult: newQuery,
        crossGenerationMerged: false
      },
      cachePolicy: {
        carried: dnsMetrics.cacheCarriedOver,
        dropped: dnsMetrics.cacheDropped
      },
      fakeIpChange: {
        rejected: true,
        activeGenerationUnchanged: true,
        rejectionCount: dnsMetrics.rejectedFakeIpChanges
      },
      existingConnection: {
        survivedReload: true,
        connectionsClosedByReload: 0
      },
      sideEffects: {
        listenersChanged: 0,
        fakeIpChanged: false
      }
    };
  } finally {
    if (tunnel !== undefined) closeSocket(tunnel);
    await engine.stop();
    await Promise.all([oldDns.close(), newDns.close(), closeServer(echo.server)]);
  }
  const leaks = engine.getLeakSnapshot();
  return {
    generatedAt: new Date().toISOString(),
    ...reportState,
    resources: {
      activeConnections: engine.getStats().activeConnections,
      activeSockets: leaks.activeSockets,
      activeTimers: leaks.activeTimers,
      activeListeners: leaks.activeListeners
    }
  };
};

export const writeRuntimeSmokeDnsReport = async (
  report: RuntimeSmokeDnsReport,
  outputDirectory = "reports/reload"
): Promise<void> => {
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(
      resolve(outputDirectory, "runtime-smoke-dns-latest.json"),
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8"
    ),
    writeFile(
      resolve(outputDirectory, "runtime-smoke-dns-latest.md"),
      renderMarkdown(report),
      "utf8"
    )
  ]);
};

const createInitialConfig = (
  candidate: SepigsConfig,
  oldDnsPort: number
): SepigsConfig => ({
  ...candidate,
  reload: {
    ...candidate.reload,
    mode: "legacy"
  },
  dns: {
    ...candidate.dns,
    udpServers: [{
      tag: "old-local",
      address: "127.0.0.1",
      port: oldDnsPort,
      timeoutMs: 500
    }]
  }
});

const withDnsServer = (
  config: SepigsConfig,
  tag: string,
  port: number
): SepigsConfig => ({
  ...config,
  dns: {
    ...config.dns,
    udpServers: [{
      tag,
      address: "127.0.0.1",
      port,
      timeoutMs: 500
    }]
  }
});

const withFakeIpEnabled = (config: SepigsConfig): SepigsConfig => ({
  ...config,
  dns: {
    ...config.dns,
    fakeIp: {
      ...config.dns.fakeIp,
      enabled: true
    }
  }
});

const validateCandidate = (config: SepigsConfig): void => {
  if (config.reload.mode !== "transactional-experimental") {
    throw new Error("DNS smoke requires transactional-experimental mode");
  }
  if (!config.reload.transactional.enabledComponents.includes("dns")) {
    throw new Error("DNS smoke requires the dns component");
  }
  if (config.dns.fakeIp.enabled) {
    throw new Error("DNS smoke candidate must keep fake-IP disabled");
  }
  if (!config.observability.metrics.enabled) {
    throw new Error("DNS smoke requires loopback metrics");
  }
};

const startDnsServer = async (
  address: string,
  delayMs: number
): Promise<{
  readonly port: number;
  queries(): number;
  close(): Promise<void>;
}> => {
  const server = dgram.createSocket("udp4");
  let queryCount = 0;
  server.on("message", (message, rinfo) => {
    queryCount += 1;
    setTimeout(() => {
      server.send(buildDnsResponse(message, address), rinfo.port, rinfo.address);
    }, delayMs);
  });
  await new Promise<void>((resolvePromise, reject) => {
    server.once("error", reject);
    server.bind(0, "127.0.0.1", () => {
      resolvePromise();
    });
  });
  return {
    port: server.address().port,
    queries: () => queryCount,
    close: async () => {
      await new Promise<void>((resolvePromise) => {
        server.close(() => {
          resolvePromise();
        });
      });
    }
  };
};

const startEchoServer = async (): Promise<{
  readonly server: net.Server;
  readonly port: number;
}> => {
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

const openConnectTunnel = async (
  proxyPort: number,
  targetPort: number
): Promise<net.Socket> => {
  const socket = await connect(proxyPort);
  socket.write(
    `CONNECT 127.0.0.1:${String(targetPort)} HTTP/1.1\r\n` +
    `Host: 127.0.0.1:${String(targetPort)}\r\n\r\n`
  );
  const response = await readUntil(socket, (buffer) => buffer.includes("\r\n\r\n"));
  if (!/^HTTP\/1\.1 200 Connection Established/mu.test(response.toString("utf8"))) {
    throw new Error("DNS smoke failed to establish HTTP CONNECT tunnel");
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

const expectPayload = async (socket: net.Socket, expected: string): Promise<void> => {
  const result = await readUntil(
    socket,
    (buffer) => buffer.byteLength >= Buffer.byteLength(expected)
  );
  if (result.toString("utf8") !== expected) {
    throw new Error(`DNS smoke tunnel returned "${result.toString("utf8")}"`);
  }
};

const readUntil = async (
  socket: TcpStream,
  predicate: (buffer: Buffer) => boolean
): Promise<Buffer> =>
  await new Promise((resolvePromise, reject) => {
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("DNS smoke socket read timed out"));
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
      reject(new Error("DNS smoke socket closed before expected data"));
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
  throw new Error("DNS smoke condition timed out");
};

const addressPort = (
  address: ReturnType<net.Server["address"]>
): number => {
  if (typeof address !== "object" || address === null) {
    throw new Error("DNS smoke endpoint is not listening");
  }
  return address.port;
};

const sameAddress = (
  left: ReturnType<Engine["getInboundAddress"]>,
  right: ReturnType<Engine["getInboundAddress"]>
): boolean => JSON.stringify(left) === JSON.stringify(right);

const closeServer = async (server: net.Server): Promise<void> => {
  await new Promise<void>((resolvePromise, reject) => {
    server.close((error?: Error) => {
      if (error === undefined) resolvePromise();
      else reject(error);
    });
  });
};

const buildDnsResponse = (query: Buffer, address: string): Buffer => {
  let questionEnd = 12;
  while (questionEnd < query.length && query[questionEnd] !== 0) {
    questionEnd += (query[questionEnd] ?? 0) + 1;
  }
  questionEnd += 5;
  const header = Buffer.from(query.subarray(0, 12));
  header[2] = 0x81;
  header[3] = 0x80;
  header[6] = 0x00;
  header[7] = 0x01;
  const octets = address.split(".").map(Number);
  return Buffer.concat([
    header,
    query.subarray(12, questionEnd),
    Buffer.from([
      0xc0, 0x0c, 0x00, 0x01, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x3c, 0x00, 0x04,
      ...octets
    ])
  ]);
};

const renderMarkdown = (report: RuntimeSmokeDnsReport): string => [
  "# M8.5 DNS Runtime Smoke",
  "",
  `- Generated: ${report.generatedAt}`,
  `- Transaction state: ${report.transactionState}`,
  `- DNS generation switched: ${report.generation.switched ? "yes" : "no"}`,
  `- Old in-flight answer: ${report.queryChecks.oldInFlightResult}`,
  `- New generation answer: ${report.queryChecks.newGenerationResult}`,
  `- Cache carried/dropped: ${String(report.cachePolicy.carried)}/${String(report.cachePolicy.dropped)}`,
  "- Fake-IP change rejected: yes",
  "- Established connection survived: yes",
  `- Connections closed by reload: ${String(report.existingConnection.connectionsClosedByReload)}`,
  `- Listener changes: ${String(report.sideEffects.listenersChanged)}`,
  `- Final active connections: ${String(report.resources.activeConnections)}`,
  `- Final sockets/timers/listeners: ${String(report.resources.activeSockets)}/${String(report.resources.activeTimers)}/${String(report.resources.activeListeners)}`,
  ""
].join("\n");

const argument = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index < 0 ? undefined : process.argv[index + 1];
};

const main = async (): Promise<void> => {
  const configPath =
    argument("--config") ?? "examples/sepigs.transactional-dns.experimental.json";
  const report = await runRuntimeSmokeDns(configPath);
  await writeRuntimeSmokeDnsReport(report);
  if (
    !report.generation.switched ||
    report.generation.drainingAfterOldCompletion !== 0 ||
    report.queryChecks.oldInFlightResult === report.queryChecks.newGenerationResult ||
    report.fakeIpChange.rejectionCount < 1 ||
    report.cachePolicy.dropped < 1 ||
    report.resources.activeConnections !== 0 ||
    report.resources.activeSockets !== 0 ||
    report.resources.activeTimers !== 0 ||
    report.resources.activeListeners !== 0
  ) {
    throw new Error("DNS runtime smoke acceptance checks failed");
  }
  console.log(
    "DNS runtime smoke passed; generations isolated; fake-IP rejected; resources 0/0/0"
  );
};

const entryPath = process.argv[1];
if (entryPath !== undefined && fileURLToPath(import.meta.url) === resolve(entryPath)) {
  main().catch((error: unknown) => {
    console.error(`DNS runtime smoke failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}
