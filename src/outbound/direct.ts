import net from "node:net";
import type { DirectOutboundConfig, LimitConfig } from "../config/types.js";
import type { DnsResolver } from "../dns/resolver.js";
import type { Logger } from "../logger/logger.js";
import type { ProxyRequest, TcpOutboundConnection, UdpOutboundPacket } from "../protocol/types.js";
import { connectTcp } from "../utils/net.js";
import { UdpDirectSender } from "./udpDirect.js";
import type { Outbound } from "./outbound.js";

export class DirectOutbound implements Outbound {
  public readonly tag: string;
  public readonly type = "direct" as const;
  private readonly config: DirectOutboundConfig;
  private readonly limits: LimitConfig;
  private readonly logger: Logger;
  private readonly dnsResolver: DnsResolver | undefined;

  public constructor(config: DirectOutboundConfig, limits: LimitConfig, logger: Logger, dnsResolver?: DnsResolver) {
    this.tag = config.tag;
    this.config = config;
    this.limits = limits;
    this.logger = logger;
    this.dnsResolver = dnsResolver;
  }

  public async connect(request: ProxyRequest): Promise<TcpOutboundConnection> {
    const timeoutMs = this.config.connectTimeoutMs ?? this.limits.connectTimeoutMs;
    const host = this.dnsResolver === undefined ? request.destination.host : await this.dnsResolver.resolve(request.destination.host);
    const socket = await connectTcp(host, request.destination.port, timeoutMs, this.logger);
    return { socket, outboundTag: this.tag };
  }

  public async sendUdp(request: ProxyRequest, payload: Buffer): Promise<UdpOutboundPacket | undefined> {
    const timeoutMs = this.config.connectTimeoutMs ?? this.limits.connectTimeoutMs;
    const host = this.dnsResolver === undefined ? request.destination.host : await this.dnsResolver.resolve(request.destination.host);
    const response = await new UdpDirectSender(timeoutMs, this.logger).send({ ...request.destination, host, addressType: net.isIP(host) === 6 ? "ipv6" : net.isIP(host) === 4 ? "ipv4" : "domain" }, payload);
    if (response === undefined) {
      return undefined;
    }
    return {
      payload: response,
      source: request.destination
    };
  }

  public async stop(): Promise<void> {
    await Promise.resolve();
  }
}
