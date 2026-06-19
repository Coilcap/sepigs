#!/usr/bin/env tsx
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { parseConfig } from "../../src/config/schema.js";
import { Engine } from "../../src/core/engine.js";
import { closeSocket } from "../../src/utils/net.js";
import { connectClient, getPort, readUntil, startTcpEchoServer, startHttpServer } from "../../test/helpers.js";

interface InteropResult {
  readonly client: string;
  readonly status: "verified" | "partially verified" | "not verified" | "failed";
  readonly environment: string;
  readonly command: string;
  readonly result: string;
  readonly limitation: string;
}

const main = async (): Promise<void> => {
  const upstreamHttp = await startHttpServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("sepigs-interop-http");
  });
  const upstreamTcp = await startTcpEchoServer();
  const engine = new Engine(
    parseConfig({
      log: { level: "silent" },
      inbounds: [
        { type: "http", tag: "http-open", listen: "127.0.0.1", port: 0 },
        { type: "http", tag: "http-auth", listen: "127.0.0.1", port: 0, auth: { username: "u", password: "p" } },
        { type: "socks5", tag: "socks-open", listen: "127.0.0.1", port: 0 },
        { type: "socks5", tag: "socks-auth", listen: "127.0.0.1", port: 0, auth: { username: "u", password: "p" } }
      ],
      outbounds: [{ type: "direct", tag: "direct" }],
      route: { defaultOutbound: "direct", rules: [] }
    })
  );

  await engine.start();
  const httpOpenPort = getPort(engine.getInboundAddress("http-open"));
  const httpAuthPort = getPort(engine.getInboundAddress("http-auth"));
  const socksOpenPort = getPort(engine.getInboundAddress("socks-open"));
  const socksAuthPort = getPort(engine.getInboundAddress("socks-auth"));

  try {
    const results: InteropResult[] = [];
    results.push(await curlHttpProxy(httpOpenPort, upstreamHttp.port));
    results.push(await curlSocksProxy(socksOpenPort, upstreamHttp.port));
    results.push(await curlHttpBasicAuth(httpAuthPort, upstreamHttp.port));
    results.push(await curlSocksAuth(socksAuthPort, upstreamHttp.port));
    results.push(await nodeHttpConnect(httpAuthPort, upstreamTcp.port));
    results.push(...manualTemplates());

    await mkdir("docs", { recursive: true });
    const rendered = render(results);
    await writeFile("docs/interop.md", rendered, "utf8");
    await writeFile("examples/client-compatibility.md", rendered, "utf8");
    console.log(`interop matrix written: ${results.length} rows`);
  } finally {
    await engine.stop();
    await upstreamTcp.close();
    await upstreamHttp.close();
  }
};

const curlHttpProxy = async (proxyPort: number, upstreamPort: number): Promise<InteropResult> => {
  const command = `curl -s -x http://127.0.0.1:${proxyPort} http://127.0.0.1:${upstreamPort}/`;
  return await runCurl("curl HTTP proxy", command, ["-s", "-x", `http://127.0.0.1:${proxyPort}`, `http://127.0.0.1:${upstreamPort}/`]);
};

const curlSocksProxy = async (proxyPort: number, upstreamPort: number): Promise<InteropResult> => {
  const command = `curl -s --socks5 127.0.0.1:${proxyPort} http://127.0.0.1:${upstreamPort}/`;
  return await runCurl("curl SOCKS5 proxy", command, ["-s", "--socks5", `127.0.0.1:${proxyPort}`, `http://127.0.0.1:${upstreamPort}/`]);
};

const curlHttpBasicAuth = async (proxyPort: number, upstreamPort: number): Promise<InteropResult> => {
  const command = `curl -s -x http://u:p@127.0.0.1:${proxyPort} http://127.0.0.1:${upstreamPort}/`;
  return await runCurl("curl HTTP Basic Auth", command, ["-s", "-x", `http://u:p@127.0.0.1:${proxyPort}`, `http://127.0.0.1:${upstreamPort}/`]);
};

const curlSocksAuth = async (proxyPort: number, upstreamPort: number): Promise<InteropResult> => {
  const command = `curl -s --socks5 u:p@127.0.0.1:${proxyPort} http://127.0.0.1:${upstreamPort}/`;
  return await runCurl("curl SOCKS5 username/password", command, ["-s", "--socks5", `u:p@127.0.0.1:${proxyPort}`, `http://127.0.0.1:${upstreamPort}/`]);
};

const runCurl = async (client: string, command: string, args: readonly string[]): Promise<InteropResult> => {
  try {
    const result = await runCommand("curl", args);
    return {
      client,
      status: result.exitCode === 0 && result.stdout.includes("sepigs-interop-http") ? "verified" : "failed",
      environment: `${process.platform} node ${process.version}`,
      command,
      result: result.stdout.trim() || result.stderr.trim() || `exit ${result.exitCode}`,
      limitation: "Automated local curl verification only."
    };
  } catch (error) {
    return {
      client,
      status: "not verified",
      environment: `${process.platform} node ${process.version}`,
      command,
      result: error instanceof Error ? error.message : String(error),
      limitation: "curl was not available in this environment."
    };
  }
};

const nodeHttpConnect = async (proxyPort: number, upstreamPort: number): Promise<InteropResult> => {
  const socket = await connectClient(proxyPort);
  try {
    socket.write(`CONNECT 127.0.0.1:${upstreamPort} HTTP/1.1\r\nHost: 127.0.0.1:${upstreamPort}\r\nProxy-Authorization: Basic dTpw\r\n\r\n`);
    await readUntil(socket, (buffer) => buffer.includes("200 Connection Established"));
    socket.write("node-echo");
    const response = await readUntil(socket, (buffer) => buffer.includes("node-echo"));
    return {
      client: "node http client through proxy",
      status: "verified",
      environment: `${process.platform} node ${process.version}`,
      command: "net.Socket CONNECT with Proxy-Authorization",
      result: response.toString("latin1"),
      limitation: "Local TCP echo only."
    };
  } finally {
    closeSocket(socket);
  }
};

const runCommand = async (command: string, args: readonly string[]): Promise<{ readonly exitCode: number; readonly stdout: string; readonly stderr: string }> => {
  return await new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: ["ignore", "pipe", "pipe"] });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });
    child.once("error", reject);
    child.once("exit", (code) => {
      resolve({ exitCode: code ?? 1, stdout: Buffer.concat(stdout).toString("utf8"), stderr: Buffer.concat(stderr).toString("utf8") });
    });
  });
};

const manualTemplates = (): readonly InteropResult[] => {
  const environment = `${process.platform} node ${process.version}`;
  return ["Chrome/system proxy", "Clash/Mihomo", "Shadowrocket", "NekoBox", "v2rayN", "Surge", "Stash"].map((client) => ({
    client,
    status: "not verified",
    environment,
    command: "manual client/device verification required",
    result: "not verified",
    limitation: "No GUI/mobile client automation was available in this environment."
  }));
};

const render = (results: readonly InteropResult[]): string => {
  return [
    "# Client Compatibility",
    "",
    "| Client | Status | Environment | Command/config used | Result | Known limitation |",
    "| --- | --- | --- | --- | --- | --- |",
    ...results.map(
      (result) =>
        `| ${escapeCell(result.client)} | ${result.status} | ${escapeCell(result.environment)} | ${escapeCell(result.command)} | ${escapeCell(result.result)} | ${escapeCell(result.limitation)} |`
    ),
    ""
  ].join("\n");
};

const escapeCell = (value: string): string => {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
};

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack : String(error));
  process.exitCode = 1;
});
