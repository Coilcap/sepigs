import http from "node:http";
import type { AddressInfo } from "node:net";
import type { MetricsServerConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";

export type MetricsRenderer = () => string;

export class PrometheusMetricsServer {
  private config: MetricsServerConfig;
  private readonly logger: Logger;
  private readonly render: MetricsRenderer;
  private server: http.Server | undefined;

  public constructor(config: MetricsServerConfig, render: MetricsRenderer, logger: Logger) {
    this.config = config;
    this.render = render;
    this.logger = logger;
  }

  public async start(): Promise<void> {
    if (!this.config.enabled || this.server !== undefined) {
      return;
    }

    this.server = http.createServer((request, response) => {
      if (request.method !== "GET" || request.url?.split("?")[0] !== this.config.path) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("not found\n");
        return;
      }

      response.writeHead(200, { "content-type": "text/plain; version=0.0.4; charset=utf-8" });
      response.end(this.render());
    });

    this.server.on("error", (error) => {
      this.logger.error("metrics server error", { error: error.message });
    });

    const server = this.server;
    try {
      await new Promise<void>((resolve, reject) => {
      const onError = (error: Error): void => {
        server.removeListener("listening", onListening);
        reject(error);
      };
      const onListening = (): void => {
        server.removeListener("error", onError);
        resolve();
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(this.config.port, this.config.listen);
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

    const address = this.address();
    this.logger.info("metrics server started", {
      listen: this.config.listen,
      port: typeof address === "object" && address !== null ? address.port : this.config.port,
      path: this.config.path
    });
  }

  public async stop(): Promise<void> {
    const server = this.server;
    if (server === undefined) {
      return;
    }
    this.server = undefined;
    await new Promise<void>((resolve, reject) => {
      server.close((error?: Error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  public address(): AddressInfo | string | null {
    return this.server?.address() ?? null;
  }

  public configuration(): MetricsServerConfig {
    return { ...this.config };
  }

  public updateConfig(config: MetricsServerConfig): void {
    if (
      this.server !== undefined &&
      (!config.enabled || config.listen !== this.config.listen || config.port !== this.config.port)
    ) {
      throw new Error("active metrics server can only update path in place");
    }
    this.config = { ...config };
  }
}
