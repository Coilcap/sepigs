import http from "node:http";
import net from "node:net";
import type {
  DashboardConfig,
  DnsConfig,
  MetricsServerConfig,
  OutboundConfig,
  RoutingPolicyConfig,
  SepigsConfig,
  TransactionalReloadComponent
} from "../../src/config/types.js";
import { parseConfig } from "../../src/config/schema.js";
import { getPort } from "../helpers.js";

export interface RuntimeConfigOptions {
  readonly metrics?: Partial<MetricsServerConfig>;
  readonly dashboard?: Partial<DashboardConfig>;
  readonly mode?: "legacy" | "transactional-experimental";
  readonly enabledComponents?: readonly TransactionalReloadComponent[];
  readonly routeSuffix?: string;
  readonly defaultOutbound?: string;
  readonly outbounds?: readonly OutboundConfig[];
  readonly policies?: readonly RoutingPolicyConfig[];
  readonly dns?: Partial<Omit<DnsConfig, "fakeIp" | "doh">> & {
    readonly fakeIp?: Partial<DnsConfig["fakeIp"]>;
    readonly doh?: Partial<DnsConfig["doh"]>;
  };
}

export const runtimeConfig = (options: RuntimeConfigOptions = {}): SepigsConfig =>
  parseConfig({
    configVersion: 1,
    log: { level: "silent" },
    reload: {
      mode: options.mode ?? "legacy",
      transactional: {
        enabledComponents: options.enabledComponents ?? [],
        timeoutMs: 2_000,
        shadowBeforeCommit: true,
        rollbackOnFailure: true
      }
    },
    observability: {
      metrics: {
        enabled: false,
        listen: "127.0.0.1",
        port: 0,
        path: "/metrics",
        ...options.metrics
      }
    },
    dashboard: {
      enabled: false,
      listen: "127.0.0.1",
      port: 0,
      token: "change-me",
      rateLimitPerMinute: 120,
      cors: false,
      ...options.dashboard
    },
    dns: {
      ...options.dns,
      fakeIp: {
        enabled: false,
        range: "198.18.0.0/15",
        size: 32,
        ttlSeconds: 60,
        ...options.dns?.fakeIp
      },
      doh: {
        enabled: false,
        endpoints: [],
        timeoutMs: 1_000,
        ...options.dns?.doh
      }
    },
    inbounds: [{ type: "http", tag: "http", listen: "127.0.0.1", port: 0 }],
    outbounds: options.outbounds ?? [
      { type: "direct", tag: "direct" },
      { type: "block", tag: "block" }
    ],
    route: {
      defaultOutbound: options.defaultOutbound ?? "direct",
      rules: options.routeSuffix === undefined
        ? []
        : [{ domainSuffix: [options.routeSuffix], outboundTag: "block" }],
      policies: options.policies ?? []
    }
  });

export const httpRequest = async (
  address: ReturnType<{ address(): import("node:net").AddressInfo | string | null }["address"]>,
  path: string,
  token?: string
): Promise<{ readonly status: number; readonly body: string }> => {
  const port = getPort(address);
  return await new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      path,
      headers: token === undefined ? {} : { authorization: `Bearer ${token}` }
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });
      response.once("end", () => {
        resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });
    });
    request.once("error", reject);
    request.end();
  });
};

export const reserveTcpPort = async (): Promise<{
  readonly server: net.Server;
  readonly port: number;
}> => {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.once("listening", resolve);
    server.listen(0, "127.0.0.1");
  });
  return { server, port: getPort(server.address()) };
};

export const closeTcpServer = async (server: net.Server): Promise<void> => {
  await new Promise<void>((resolve, reject) => {
    server.close((error?: Error) => {
      if (error === undefined) resolve();
      else reject(error);
    });
  });
};
