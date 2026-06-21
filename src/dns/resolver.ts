import dgram from "node:dgram";
import dns from "node:dns/promises";
import net from "node:net";
import type { DnsConfig, DnsUdpServerConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { queryDohA } from "./doh.js";
import { FakeIpService } from "./fakeIp.js";
import { NetworkError, TimeoutError } from "../utils/errors.js";

interface CacheEntry {
  readonly address?: string;
  readonly error?: Error;
  readonly expiresAt: number;
}

export interface DnsAResult {
  readonly address: string;
  readonly ttlMs: number;
}

export interface DnsResolver {
  resolve(host: string): Promise<string>;
  reverseFakeIp?(address: string): string | undefined;
}

export interface DnsMetricsRecorder {
  recordDnsQuery(): void;
  recordDnsFailure(): void;
  recordFakeIpAssignment?(): void;
}

export class SystemDnsResolver implements DnsResolver {
  private readonly config: DnsConfig;
  private readonly logger: Logger;
  private readonly metrics: DnsMetricsRecorder | undefined;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<string>>();
  private readonly fakeIp: FakeIpService | undefined;

  public constructor(config: DnsConfig, logger: Logger, metrics?: DnsMetricsRecorder) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.fakeIp = config.fakeIp.enabled ? new FakeIpService(config.fakeIp, () => this.metrics?.recordFakeIpAssignment?.()) : undefined;
  }

  public resolveForClient(host: string): Promise<string> {
    if (net.isIP(host) !== 0 || this.fakeIp === undefined) {
      return this.resolve(host);
    }
    return Promise.resolve(this.fakeIp.assign(host));
  }

  public reverseFakeIp(address: string): string | undefined {
    return this.fakeIp?.reverse(address);
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
      this.touchCache(normalizedHost, cached);
      if (cached.error !== undefined) {
        throw cached.error;
      }
      if (cached.address !== undefined) {
        return cached.address;
      }
    }

    const existing = this.inFlight.get(normalizedHost);
    if (existing !== undefined) {
      return await existing;
    }

    const pending = this.resolveUncached(host, normalizedHost);
    this.inFlight.set(normalizedHost, pending);
    try {
      return await pending;
    } finally {
      this.inFlight.delete(normalizedHost);
    }
  }

  private async resolveUncached(host: string, normalizedHost: string): Promise<string> {

    this.metrics?.recordDnsQuery();
    try {
      if (this.config.doh.enabled && this.config.doh.endpoints.length > 0 && this.config.strategy !== "prefer-ipv6") {
        const result = await queryDohA(host, this.config.doh, this.logger);
        this.setCache(normalizedHost, {
          address: result.address,
          expiresAt: Date.now() + Math.min(result.ttlMs, this.config.cacheTtlMs)
        });
        this.logger.debug("dns resolved by DoH", { host, address: result.address });
        return result.address;
      }

      const udpServer = this.selectUdpServer(normalizedHost);
      if (udpServer !== undefined && this.config.strategy !== "prefer-ipv6") {
        const result = await queryUdpA(host, udpServer);
        this.setCache(normalizedHost, {
          address: result.address,
          expiresAt: Date.now() + Math.min(result.ttlMs, this.config.cacheTtlMs)
        });
        this.logger.debug("dns resolved by UDP", { host, address: result.address, server: udpServer.tag });
        return result.address;
      }

      const family = this.config.strategy === "prefer-ipv4" ? 4 : this.config.strategy === "prefer-ipv6" ? 6 : 0;
      const result = await dns.lookup(host, { family });
      this.setCache(normalizedHost, {
        address: result.address,
        expiresAt: Date.now() + this.config.cacheTtlMs
      });
      this.logger.debug("dns resolved", { host, address: result.address, family: result.family });
      return result.address;
    } catch (error) {
      this.metrics?.recordDnsFailure();
      const fallback = this.config.fallbackHosts[normalizedHost];
      if (fallback !== undefined) {
        this.logger.warn("dns resolution failed; using fallback host", {
          host,
          fallback,
          error: error instanceof Error ? error.message : String(error)
        });
        return fallback;
      }
      const failure = error instanceof Error ? error : new NetworkError(String(error));
      const negativeTtlMs = this.config.negativeTtlMs ?? 5_000;
      if (negativeTtlMs > 0) {
        this.setCache(normalizedHost, { error: failure, expiresAt: Date.now() + negativeTtlMs });
      }
      throw failure;
    }
  }

  private setCache(host: string, entry: CacheEntry): void {
    this.cache.delete(host);
    this.cache.set(host, entry);
    while (this.cache.size > (this.config.cacheMaxEntries ?? 4_096)) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) {
        break;
      }
      this.cache.delete(oldest);
    }
  }

  private touchCache(host: string, entry: CacheEntry): void {
    this.cache.delete(host);
    this.cache.set(host, entry);
  }

  private selectUdpServer(host: string): DnsUdpServerConfig | undefined {
    if (this.config.udpServers.length === 0) {
      return undefined;
    }
    const matchedRule = this.config.rules.find((rule) => rule.domainSuffix.some((suffix) => host === suffix || host.endsWith(`.${suffix}`)));
    if (matchedRule !== undefined) {
      return this.config.udpServers.find((server) => server.tag === matchedRule.serverTag);
    }
    return this.config.udpServers[0];
  }
}

const queryUdpA = async (host: string, server: DnsUdpServerConfig): Promise<DnsAResult> => {
  const socket = dgram.createSocket(net.isIP(server.address) === 6 ? "udp6" : "udp4");
  const id = Math.floor(Math.random() * 0xffff);
  const packet = encodeDnsQuery(id, host);
  return await new Promise<DnsAResult>((resolve, reject) => {
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("message", onMessage);
      socket.removeListener("error", onError);
      socket.close();
    };
    const onMessage = (message: Buffer): void => {
      try {
        const result = decodeDnsAResponse(message, id);
        cleanup();
        resolve(result);
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new NetworkError(String(error)));
      }
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(new NetworkError("UDP DNS socket error", { cause: error }));
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(new TimeoutError(`UDP DNS query timeout after ${server.timeoutMs}ms for ${host}`));
    }, server.timeoutMs);
    timer.unref();
    socket.once("message", onMessage);
    socket.once("error", onError);
    socket.send(packet, server.port, server.address, (error) => {
      if (error !== null) {
        onError(error);
      }
    });
  });
};

export const encodeDnsQuery = (id: number, host: string): Buffer => {
  const labels = host.split(".");
  const questionParts = labels.flatMap((label) => [Buffer.from([Buffer.byteLength(label)]), Buffer.from(label, "ascii")]);
  return Buffer.concat([
    Buffer.from([
      (id >> 8) & 0xff,
      id & 0xff,
      0x01,
      0x00,
      0x00,
      0x01,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00,
      0x00
    ]),
    ...questionParts,
    Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01])
  ]);
};

export const decodeDnsAResponse = (message: Buffer, expectedId: number): DnsAResult => {
  if (message.byteLength < 12) {
    throw new NetworkError("invalid DNS response");
  }
  const id = ((message[0] ?? 0) << 8) + (message[1] ?? 0);
  if (id !== expectedId) {
    throw new NetworkError("DNS response id mismatch");
  }
  const answerCount = ((message[6] ?? 0) << 8) + (message[7] ?? 0);
  let offset = 12;
  offset = skipDnsName(message, offset) + 4;
  for (let answer = 0; answer < answerCount; answer += 1) {
    offset = skipDnsName(message, offset);
    if (offset + 10 > message.byteLength) {
      throw new NetworkError("truncated DNS answer");
    }
    const type = ((message[offset] ?? 0) << 8) + (message[offset + 1] ?? 0);
    const klass = ((message[offset + 2] ?? 0) << 8) + (message[offset + 3] ?? 0);
    const ttl = message.readUInt32BE(offset + 4);
    const length = ((message[offset + 8] ?? 0) << 8) + (message[offset + 9] ?? 0);
    offset += 10;
    if (offset + length > message.byteLength) {
      throw new NetworkError("truncated DNS rdata");
    }
    if (type === 1 && klass === 1 && length === 4) {
      return {
        address: `${message[offset] ?? 0}.${message[offset + 1] ?? 0}.${message[offset + 2] ?? 0}.${message[offset + 3] ?? 0}`,
        ttlMs: Math.max(1_000, ttl * 1_000)
      };
    }
    offset += length;
  }
  throw new NetworkError("DNS response did not contain an A record");
};

const skipDnsName = (message: Buffer, offset: number): number => {
  let cursor = offset;
  while (cursor < message.byteLength) {
    const length = message[cursor] ?? 0;
    if ((length & 0xc0) === 0xc0) {
      return cursor + 2;
    }
    cursor += 1;
    if (length === 0) {
      return cursor;
    }
    cursor += length;
  }
  throw new NetworkError("truncated DNS name");
};
