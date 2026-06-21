import { writeFile } from "node:fs/promises";
import { parseConfig } from "../../src/config/schema.js";
import { Engine } from "../../src/core/engine.js";
import { closeSocket } from "../../src/utils/net.js";
import { connectClient, getPort, readUntil, startTcpEchoServer, waitFor } from "../helpers.js";
import { readTestNetworkConfig } from "../../src/utils/testNetwork.js";

const TEST_NETWORK = readTestNetworkConfig();

interface MatrixResult {
  readonly name: string;
  readonly status: "verified" | "failed";
  readonly durationMs: number;
  readonly result: string;
}

const main = async (): Promise<void> => {
  const scenarios: Array<readonly [string, () => Promise<string>]> = [
    ["low concurrency long connection", lowConcurrencyLongConnection],
    ["high concurrency short connection", highConcurrencyShortConnection],
    ["medium sustained requests", mediumSustainedRequests],
    ["hot reload during traffic", hotReloadDuringTraffic],
    ["DNS failure fallback", dnsFailureFallback],
    ["outbound failure failover", outboundFailureFailover],
    ["auth success and failure", authSuccessFailure]
  ];

  const results: MatrixResult[] = [];
  for (const [name, scenario] of scenarios) {
    const startedAt = performance.now();
    try {
      const result = await scenario();
      results.push({ name, status: "verified", durationMs: performance.now() - startedAt, result });
    } catch (error) {
      results.push({
        name,
        status: "failed",
        durationMs: performance.now() - startedAt,
        result: error instanceof Error ? error.message : String(error)
      });
    }
  }

  await writeFile("docs/soak-matrix-report.md", render(results), "utf8");
  const failures = results.filter((result) => result.status === "failed");
  console.log(`soak matrix completed: ${results.length - failures.length}/${results.length} verified, report docs/soak-matrix-report.md`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
};

const lowConcurrencyLongConnection = async (): Promise<string> => {
  const echo = await startTcpEchoServer();
  const engine = createEngine([{ type: "direct", tag: "direct" }], "direct");
  await engine.start();
  const client = await connectClient(getPort(engine.getInboundAddress("http-in")));
  try {
    client.write(`CONNECT ${TEST_NETWORK.host}:${echo.port} HTTP/1.1\r\nHost: ${TEST_NETWORK.host}:${echo.port}\r\n\r\n`);
    await readUntil(client, (buffer) => buffer.includes("200 Connection Established"));
    for (let index = 0; index < 5; index += 1) {
      const payload = `long-${index}`;
      client.write(payload);
      await readUntil(client, (buffer) => buffer.includes(payload));
      await sleep(50);
    }
    return "single tunnel stayed usable across repeated writes";
  } finally {
    closeSocket(client);
    await engine.stop();
    await echo.close();
  }
};

const highConcurrencyShortConnection = async (): Promise<string> => {
  const echo = await startTcpEchoServer();
  const engine = createEngine([{ type: "direct", tag: "direct" }], "direct");
  await engine.start();
  try {
    const port = getPort(engine.getInboundAddress("http-in"));
    await Promise.all(
      Array.from({ length: 64 }, async (_item, index) => {
        await httpConnect(port, echo.port, `short-${index}`);
      })
    );
    await waitFor(() => engine.getActiveConnections().length === 0, 3_000);
    return "64 short HTTP CONNECT requests completed";
  } finally {
    await engine.stop();
    await echo.close();
  }
};

const mediumSustainedRequests = async (): Promise<string> => {
  const echo = await startTcpEchoServer();
  const engine = createEngine([{ type: "direct", tag: "direct" }], "direct");
  await engine.start();
  try {
    const port = getPort(engine.getInboundAddress("http-in"));
    for (let index = 0; index < 40; index += 1) {
      await httpConnect(port, echo.port, `medium-${index}`);
    }
    return "40 sequential requests completed";
  } finally {
    await engine.stop();
    await echo.close();
  }
};

const hotReloadDuringTraffic = async (): Promise<string> => {
  const echo = await startTcpEchoServer();
  const engine = createEngine(
    [
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" }
    ],
    "direct"
  );
  await engine.start();
  try {
    const port = getPort(engine.getInboundAddress("http-in"));
    await httpConnect(port, echo.port, "before-reload");
    await engine.reloadConfig(
      parseConfig({
        log: { level: "silent" },
        inbounds: [{ type: "http", tag: "http-in", listen: TEST_NETWORK.host, port: 0 }],
        outbounds: [
          { type: "direct", tag: "direct" },
          { type: "block", tag: "block" }
        ],
        route: { defaultOutbound: "direct", rules: [{ tag: "block-admin", port: [1], outboundTag: "block" }] }
      })
    );
    await httpConnect(port, echo.port, "after-reload");
    return "traffic worked before and after route reload";
  } finally {
    await engine.stop();
    await echo.close();
  }
};

const dnsFailureFallback = async (): Promise<string> => {
  const echo = await startTcpEchoServer();
  const engine = new Engine(
    parseConfig({
      log: { level: "silent" },
      dns: {
        udpServers: [{ tag: "broken", address: TEST_NETWORK.host, port: 9, timeoutMs: 20 }],
        fallbackHosts: { "fallback.matrix.test": TEST_NETWORK.host }
      },
      inbounds: [{ type: "http", tag: "http-in", listen: TEST_NETWORK.host, port: 0 }],
      outbounds: [{ type: "direct", tag: "direct" }],
      route: { defaultOutbound: "direct", rules: [] }
    })
  );
  await engine.start();
  try {
    await httpConnect(getPort(engine.getInboundAddress("http-in")), echo.port, "dns-fallback", "fallback.matrix.test");
    return "DNS failure used fallbackHosts";
  } finally {
    await engine.stop();
    await echo.close();
  }
};

const outboundFailureFailover = async (): Promise<string> => {
  const echo = await startTcpEchoServer();
  const engine = new Engine(
    parseConfig({
      log: { level: "silent" },
      inbounds: [{ type: "http", tag: "http-in", listen: TEST_NETWORK.host, port: 0 }],
      outbounds: [
        { type: "block", tag: "block" },
        { type: "direct", tag: "direct" }
      ],
      route: {
        defaultOutbound: "failover-policy",
        rules: [],
        policies: [{ tag: "failover-policy", type: "failover", outbounds: ["block", "direct"], strategy: "roundRobin" }]
      }
    })
  );
  await engine.start();
  try {
    await httpConnect(getPort(engine.getInboundAddress("http-in")), echo.port, "failover");
    if (engine.getStats().outboundFailuresTotal < 1) {
      throw new Error("expected outbound failure counter to increase");
    }
    return "block failure failed over to direct";
  } finally {
    await engine.stop();
    await echo.close();
  }
};

const authSuccessFailure = async (): Promise<string> => {
  const echo = await startTcpEchoServer();
  const engine = new Engine(
    parseConfig({
      log: { level: "silent" },
      inbounds: [{ type: "http", tag: "http-in", listen: TEST_NETWORK.host, port: 0, auth: { username: "u", password: "p" } }],
      outbounds: [{ type: "direct", tag: "direct" }],
      route: { defaultOutbound: "direct", rules: [] }
    })
  );
  await engine.start();
  try {
    const port = getPort(engine.getInboundAddress("http-in"));
    const missing = await httpConnectRaw(port, echo.port, "auth-missing", TEST_NETWORK.host);
    if (!missing.includes("407")) {
      throw new Error("expected missing auth to be rejected");
    }
    const ok = await httpConnect(port, echo.port, "auth-ok", TEST_NETWORK.host, "Basic dTpw");
    return `auth failure rejected and success returned ${ok} bytes`;
  } finally {
    await engine.stop();
    await echo.close();
  }
};

const createEngine = (outbounds: readonly object[], defaultOutbound: string): Engine => {
  return new Engine(
    parseConfig({
      log: { level: "silent" },
      inbounds: [{ type: "http", tag: "http-in", listen: TEST_NETWORK.host, port: 0 }],
      outbounds,
      route: { defaultOutbound, rules: [] }
    })
  );
};

const httpConnect = async (proxyPort: number, targetPort: number, payload: string, host = TEST_NETWORK.host, auth?: string): Promise<number> => {
  const response = await httpConnectRaw(proxyPort, targetPort, payload, host, auth);
  if (!response.includes(payload)) {
    throw new Error(`expected tunneled payload "${payload}"`);
  }
  return response.length;
};

const httpConnectRaw = async (proxyPort: number, targetPort: number, payload: string, host: string, auth?: string): Promise<string> => {
  const socket = await connectClient(proxyPort);
  try {
    const authHeader = auth === undefined ? "" : `Proxy-Authorization: ${auth}\r\n`;
    socket.write(`CONNECT ${host}:${targetPort} HTTP/1.1\r\nHost: ${host}:${targetPort}\r\n${authHeader}\r\n`);
    const head = await readUntil(socket, (buffer) => buffer.includes("\r\n\r\n"));
    if (!head.includes("200 Connection Established")) {
      return head.toString("latin1");
    }
    socket.write(payload);
    return (await readUntil(socket, (buffer) => buffer.includes(payload))).toString("latin1");
  } finally {
    closeSocket(socket);
  }
};

const sleep = async (timeoutMs: number): Promise<void> => {
  await new Promise((resolve) => {
    setTimeout(resolve, timeoutMs);
  });
};

const render = (results: readonly MatrixResult[]): string => {
  return [
    "# Soak Matrix Report",
    "",
    "| Scenario | Status | Duration ms | Result |",
    "| --- | --- | ---: | --- |",
    ...results.map((result) => `| ${result.name} | ${result.status} | ${result.durationMs.toFixed(2)} | ${result.result.replaceAll("|", "\\|")} |`),
    ""
  ].join("\n");
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
