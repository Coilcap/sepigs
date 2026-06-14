import { createHash } from "node:crypto";
import tls from "node:tls";
import type { LimitConfig, TrojanOutboundConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { encodeSocksAddress } from "../protocol/address.js";
import type { ProxyRequest, TcpOutboundConnection } from "../protocol/types.js";
import { connectTcp } from "../utils/net.js";
import type { Outbound } from "./outbound.js";

export class TrojanOutbound implements Outbound {
  public readonly tag: string;
  public readonly type = "trojan" as const;
  private readonly config: TrojanOutboundConfig;
  private readonly limits: LimitConfig;
  private readonly logger: Logger;

  public constructor(config: TrojanOutboundConfig, limits: LimitConfig, logger: Logger) {
    this.tag = config.tag;
    this.config = config;
    this.limits = limits;
    this.logger = logger;
  }

  public async connect(request: ProxyRequest): Promise<TcpOutboundConnection> {
    const timeoutMs = this.config.connectTimeoutMs ?? this.limits.connectTimeoutMs;
    const socket = this.config.tls.enabled ? await this.connectTls(timeoutMs) : await connectTcp(this.config.serverHost, this.config.serverPort, timeoutMs, this.logger);
    socket.write(createTrojanRequest(this.config.password, request.destination));
    return { socket, outboundTag: this.tag };
  }

  public async stop(): Promise<void> {
    await Promise.resolve();
  }

  private async connectTls(timeoutMs: number): Promise<tls.TLSSocket> {
    return await new Promise<tls.TLSSocket>((resolve, reject) => {
      const socket = tls.connect({
        host: this.config.serverHost,
        port: this.config.serverPort,
        servername: this.config.tls.serverName ?? this.config.serverHost,
        rejectUnauthorized: this.config.tls.rejectUnauthorized
      });
      let settled = false;

      const cleanup = (): void => {
        clearTimeout(timer);
        socket.removeListener("secureConnect", onConnect);
        socket.removeListener("error", onError);
      };

      const onConnect = (): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        resolve(socket);
      };

      const onError = (error: Error): void => {
        if (settled) {
          return;
        }
        settled = true;
        cleanup();
        socket.destroy();
        reject(error);
      };

      const timer = setTimeout(() => {
        onError(new Error(`trojan TLS connect timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.once("secureConnect", onConnect);
      socket.once("error", onError);
    });
  }
}

export const createTrojanRequest = (password: string, destination: ProxyRequest["destination"]): Buffer => {
  const passwordHash = createHash("sha224").update(password).digest("hex");
  return Buffer.concat([Buffer.from(`${passwordHash}\r\n`, "ascii"), Buffer.from([0x01]), encodeSocksAddress(destination), Buffer.from("\r\n")]);
};
