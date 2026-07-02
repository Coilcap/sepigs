import http from "node:http";
import type { AddressInfo } from "node:net";
import type { DashboardConfig, SepigsConfig } from "../config/types.js";
import type { ConnectionSnapshot } from "../core/connectionManager.js";
import type { LeakDetectorSnapshot } from "../core/leakDetector.js";
import type { ResourceLimiterSnapshot } from "../core/resourceLimiter.js";
import type { StatsSnapshot } from "../core/stats.js";
import type { Logger, LogRecord } from "../logger/logger.js";
import { dashboardAuthorized } from "./auth.js";
import { handleDashboardRoute } from "./routes.js";

export interface DashboardRuntime {
  stats(): StatsSnapshot;
  resources(): ResourceLimiterSnapshot;
  leaks(): LeakDetectorSnapshot;
  connections(): readonly ConnectionSnapshot[];
  closeConnection(id: string): boolean;
  metrics(): string;
  outbounds(): unknown;
  config(): SepigsConfig;
  logs(): readonly LogRecord[];
  reload(): Promise<void>;
  recordRequest(ok: boolean): void;
}

export class DashboardServer {
  private server: http.Server | undefined;
  private readonly requests = new Map<string, { count: number; resetsAt: number }>();

  public constructor(private config: DashboardConfig, private readonly runtime: DashboardRuntime, private readonly logger: Logger) {}

  public async start(): Promise<void> {
    if (!this.config.enabled || this.server !== undefined) {
      return;
    }
    const server = http.createServer((request, response) => {
      response.setHeader("x-content-type-options", "nosniff");
      response.setHeader("content-security-policy", "default-src 'none'");
      if (this.config.cors) {
        response.setHeader("access-control-allow-origin", "http://127.0.0.1");
      }
      if (!this.allow(request.socket.remoteAddress ?? "unknown")) {
        this.runtime.recordRequest(false);
        response.writeHead(429).end();
        return;
      }
      if (!dashboardAuthorized(request, this.config.token)) {
        this.runtime.recordRequest(false);
        response.writeHead(401, { "www-authenticate": "Bearer" }).end();
        return;
      }
      this.runtime.recordRequest(true);
      void handleDashboardRoute(request, response, this.runtime).catch((error: unknown) => {
        this.logger.warn("dashboard request failed", { error: error instanceof Error ? error.message : String(error) });
        if (!response.headersSent) {
          response.writeHead(500, { "content-type": "application/json" });
        }
        response.end(JSON.stringify({ error: "request failed" }));
      });
    });
    this.server = server;
    try {
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(this.config.port, this.config.listen, () => {
          server.removeListener("error", reject);
          resolve();
        });
      });
    } catch (error) {
      this.server = undefined;
      server.removeAllListeners("listening");
      if (server.listening) {
        await new Promise<void>((resolve) => {
          server.close(() => {
            resolve();
          });
        });
      }
      throw error;
    }
    this.logger.info("dashboard API listening", { listen: this.config.listen, port: this.addressPort() });
  }

  public async stop(): Promise<void> {
    const server = this.server;
    this.server = undefined;
    this.requests.clear();
    if (server === undefined) {
      return;
    }
    await new Promise<void>((resolve) => server.close(() => { resolve(); }));
  }

  public address(): AddressInfo | string | null {
    return this.server?.address() ?? null;
  }

  public configuration(): DashboardConfig {
    return { ...this.config };
  }

  public updateConfig(config: DashboardConfig): void {
    if (
      this.server !== undefined &&
      (!config.enabled || config.listen !== this.config.listen || config.port !== this.config.port)
    ) {
      throw new Error("active dashboard server can only update non-listener settings in place");
    }
    this.config = { ...config };
    this.requests.clear();
  }

  private addressPort(): number {
    const address = this.address();
    return typeof address === "object" && address !== null ? address.port : this.config.port;
  }

  private allow(address: string): boolean {
    const now = Date.now();
    const current = this.requests.get(address);
    if (current === undefined || current.resetsAt <= now) {
      this.requests.set(address, { count: 1, resetsAt: now + 60_000 });
      return true;
    }
    current.count += 1;
    return current.count <= this.config.rateLimitPerMinute;
  }
}
