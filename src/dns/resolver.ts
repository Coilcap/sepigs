import dns from "node:dns/promises";
import net from "node:net";
import type { DnsConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";

interface CacheEntry {
  readonly address: string;
  readonly expiresAt: number;
}

export interface DnsResolver {
  resolve(host: string): Promise<string>;
}

export class SystemDnsResolver implements DnsResolver {
  private readonly config: DnsConfig;
  private readonly logger: Logger;
  private readonly cache = new Map<string, CacheEntry>();

  public constructor(config: DnsConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  public async resolve(host: string): Promise<string> {
    if (net.isIP(host) !== 0) {
      return host;
    }

    const normalizedHost = host.toLowerCase();
    const staticHost = this.config.hosts[normalizedHost];
    if (staticHost !== undefined) {
      return staticHost;
    }

    const cached = this.cache.get(normalizedHost);
    if (cached !== undefined && cached.expiresAt > Date.now()) {
      return cached.address;
    }

    const family = this.config.strategy === "prefer-ipv4" ? 4 : this.config.strategy === "prefer-ipv6" ? 6 : 0;
    const result = await dns.lookup(host, { family });
    this.cache.set(normalizedHost, {
      address: result.address,
      expiresAt: Date.now() + this.config.cacheTtlMs
    });
    this.logger.debug("dns resolved", { host, address: result.address, family: result.family });
    return result.address;
  }
}
