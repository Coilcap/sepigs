import type { IncomingMessage, ServerResponse } from "node:http";
import type { DashboardRuntime } from "./server.js";

const json = (response: ServerResponse, status: number, body: unknown): void => {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
};

export const handleDashboardRoute = async (
  request: IncomingMessage,
  response: ServerResponse,
  runtime: DashboardRuntime
): Promise<void> => {
  const url = new URL(request.url ?? "/", "http://localhost");
  if (request.method === "GET" && url.pathname === "/api/status") {
    json(response, 200, { stats: runtime.stats(), resources: runtime.resources(), leaks: runtime.leaks() });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/connections") {
    json(response, 200, runtime.connections());
    return;
  }
  const connectionMatch = /^\/api\/connections\/([^/]+)$/u.exec(url.pathname);
  if (request.method === "DELETE" && connectionMatch?.[1] !== undefined) {
    const closed = runtime.closeConnection(decodeURIComponent(connectionMatch[1]));
    json(response, closed ? 200 : 404, { closed });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/metrics") {
    response.writeHead(200, { "content-type": "text/plain; version=0.0.4", "cache-control": "no-store" });
    response.end(runtime.metrics());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/outbounds") {
    json(response, 200, runtime.outbounds());
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/config") {
    json(response, 200, redact(runtime.config()));
    return;
  }
  if (request.method === "POST" && url.pathname === "/api/reload") {
    await runtime.reload();
    json(response, 200, { reloaded: true });
    return;
  }
  if (request.method === "GET" && url.pathname === "/api/logs") {
    json(response, 200, runtime.logs());
    return;
  }
  json(response, 404, { error: "not found" });
};

const SECRET_KEYS = /password|token|privateKey|publicKey/iu;

export const redact = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(redact);
  }
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    output[key] = SECRET_KEYS.test(key) ? "[REDACTED]" : redact(child);
  }
  return output;
};
