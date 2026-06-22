import http from "node:http";
import { parseConfig } from "../src/config/schema.js";
import { Engine } from "../src/core/engine.js";
import { getPort } from "./helpers.js";

export const DASHBOARD_TOKEN = "phase9-dashboard-token";

export const createDashboardEngine = (overrides: Record<string, unknown> = {}): Engine => new Engine(parseConfig({
  log: { level: "silent" },
  dashboard: { enabled: true, listen: "127.0.0.1", port: 0, token: DASHBOARD_TOKEN, rateLimitPerMinute: 120 },
  inbounds: [{ type: "http", tag: "http", listen: "127.0.0.1", port: 0 }],
  outbounds: [{ type: "direct", tag: "direct" }],
  route: { defaultOutbound: "direct", rules: [] },
  ...overrides
}));

export const dashboardRequest = async (engine: Engine, path: string, method = "GET", token = DASHBOARD_TOKEN): Promise<{ status: number; body: string }> => await new Promise((resolve, reject) => {
  const request = http.request({ host: "127.0.0.1", port: getPort(engine.getDashboardAddress()), path, method, headers: { authorization: `Bearer ${token}` } }, (response) => {
    const chunks: Buffer[] = [];
    response.on("data", (chunk: Buffer) => chunks.push(chunk));
    response.on("end", () => {
      resolve({ status: response.statusCode ?? 0, body: Buffer.concat(chunks).toString("utf8") });
    });
  });
  request.once("error", reject); request.end();
});
