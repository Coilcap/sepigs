import assert from "node:assert/strict";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { getPort } from "./helpers.js";

void test("Prometheus metrics endpoint exposes text format and releases its port on stop", async () => {
  const engine = new Engine(
    parseConfig({
      log: { level: "silent" },
      observability: {
        metrics: {
          enabled: true,
          listen: "127.0.0.1",
          port: 0,
          path: "/metrics"
        }
      },
      inbounds: [{ type: "http", tag: "http-in", listen: "127.0.0.1", port: 0 }],
      outbounds: [{ type: "direct", tag: "direct" }],
      route: { defaultOutbound: "direct", rules: [] }
    })
  );

  await engine.start();
  const metricsPort = getPort(engine.getMetricsAddress());
  try {
    const body = await httpGet(metricsPort, "/metrics");
    assert.match(body, /# HELP sepigs_uptime_seconds/u);
    assert.match(body, /sepigs_connections_total \d+/u);
    assert.match(body, /sepigs_active_sockets \d+/u);
    assert.doesNotMatch(body, /password|token|authorization/ui);
  } finally {
    await engine.stop();
  }

  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
    server.listen(metricsPort, "127.0.0.1");
  });
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error !== undefined) {
        reject(error);
        return;
      }
      resolve();
    });
  });
});

const httpGet = async (port: number, path: string): Promise<string> => {
  return await new Promise<string>((resolve, reject) => {
    const request = http.get({ host: "127.0.0.1", port, path }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      response.once("error", reject);
      response.once("end", () => {
        resolve(Buffer.concat(chunks).toString("utf8"));
      });
    });
    request.once("error", reject);
  });
};
