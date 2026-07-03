import dgram from "node:dgram";
import dns from "node:dns/promises";
import net from "node:net";
import type { DnsConfig, DnsUdpServerConfig } from "../config/types.js";
import type { Logger } from "../logger/logger.js";
import { queryDohA } from "./doh.js";
import { FakeIpService } from "./fakeIp.js";
import { NetworkError, TimeoutError } from "../utils/errors.js";
import { DNSGeneration, type DnsCacheSource } from "./generation.js";
import { DNSGenerationStore } from "./generationStore.js";

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
  private readonly fakeIp: FakeIpService | undefined;
  private readonly generations: DNSGenerationStore;

  public constructor(config: DnsConfig, logger: Logger, metrics?: DnsMetricsRecorder, reusableFakeIp?: FakeIpService) {
    this.config = config;
    this.logger = logger;
    this.metrics = metrics;
    this.fakeIp = config.fakeIp.enabled
      ? reusableFakeIp ?? new FakeIpService(config.fakeIp, () => this.metrics?.recordFakeIpAssignment?.())
      : undefined;
    this.generations = new DNSGenerationStore(new DNSGeneration({
      id: "dns-generation-0",
      sequence: 0,
      config
    }));
  }

  public generationStore(): DNSGenerationStore {
    return this.generations;
  }

  public stop(): void {
    this.generations.shutdown();
  }

  public fakeIpForReload(nextConfig: DnsConfig): FakeIpService | undefined {
    if (!nextConfig.fakeIp.enabled || !this.config.fakeIp.enabled) return undefined;
    const current = this.config.fakeIp;
    const next = nextConfig.fakeIp;
    return current.range === next.range && current.cidr === next.cidr && current.size === next.size && current.ttlSeconds === next.ttlSeconds && current.persistPath === next.persistPath
      ? this.fakeIp
      : undefined;
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

    const handle = this.generations.acquire();
    const generation = handle.generation;
    try {
      const normalizedHost = host.toLowerCase();
      const staticHost = generation.config.hosts[normalizedHost];
      if (staticHost !== undefined) {
        return staticHost;
      }

      const positive = generation.getPositive(normalizedHost);
      if (positive !== undefined) {
        return positive.address;
      }
      const negative = generation.getNegative(normalizedHost);
      if (negative !== undefined) {
        throw new NetworkError(negative.message);
      }

      return await generation.runSingleFlight(
        `A:${normalizedHost}`,
        async (signal) =>
          await this.resolveUncached(generation, host, normalizedHost, signal)
      );
    } finally {
      handle.release();
    }
  }

  private async resolveUncached(
    generation: DNSGeneration,
    host: string,
    normalizedHost: string,
    signal: AbortSignal
  ): Promise<string> {
    const config = generation.config;
    const source: DnsCacheSource = generation.mode;
    this.metrics?.recordDnsQuery();
    try {
      if (generation.mode === "doh") {
        const result = await queryDohA(host, config.doh, this.logger, signal);
        generation.setPositive({
          host: normalizedHost,
          address: result.address,
          expiresAt: Date.now() + Math.min(result.ttlMs, config.cacheTtlMs),
          touchedAt: Date.now(),
          source,
          sensitive: false,
          synthetic: false
        });
        this.logger.debug("dns resolved by DoH", { host, address: result.address });
        return result.address;
      }

      const udpServer = this.selectUdpServer(config, normalizedHost);
      if (generation.mode === "udp" && udpServer !== undefined) {
        const result = await queryUdpA(host, udpServer, signal);
        generation.setPositive({
          host: normalizedHost,
          address: result.address,
          expiresAt: Date.now() + Math.min(result.ttlMs, config.cacheTtlMs),
          touchedAt: Date.now(),
          source,
          sensitive: false,
          synthetic: false
        });
        this.logger.debug("dns resolved by UDP", { host, address: result.address, server: udpServer.tag });
        return result.address;
      }

      const family = config.strategy === "prefer-ipv4" ? 4 : config.strategy === "prefer-ipv6" ? 6 : 0;
      const result = await dns.lookup(host, { family });
      if (signal.aborted) throw new NetworkError(`DNS query aborted for ${host}`);
      generation.setPositive({
        host: normalizedHost,
        address: result.address,
        expiresAt: Date.now() + config.cacheTtlMs,
        touchedAt: Date.now(),
        source,
        sensitive: false,
        synthetic: false
      });
      this.logger.debug("dns resolved", { host, address: result.address, family: result.family });
      return result.address;
    } catch (error) {
      if (signal.aborted) {
        throw error instanceof Error ? error : new NetworkError(`DNS query aborted for ${host}`);
      }
      this.metrics?.recordDnsFailure();
      const fallback = config.fallbackHosts[normalizedHost];
      if (fallback !== undefined) {
        this.logger.warn("dns resolution failed; using fallback host", {
          host,
          fallback,
          error: error instanceof Error ? error.message : String(error)
        });
        return fallback;
      }
      const failure = error instanceof Error ? error : new NetworkError(String(error));
      const negativeTtlMs = config.negativeTtlMs ?? 5_000;
      if (negativeTtlMs > 0) {
        generation.setNegative({
          host: normalizedHost,
          message: failure.message,
          expiresAt: Date.now() + negativeTtlMs,
          touchedAt: Date.now(),
          source,
          sensitive: false,
          synthetic: false
        });
      }
      throw failure;
    }
  }

  private selectUdpServer(config: DnsConfig, host: string): DnsUdpServerConfig | undefined {
    if (config.udpServers.length === 0) {
      return undefined;
    }
    const matchedRule = config.rules.find((rule) =>
      rule.domainSuffix.some((suffix) => host === suffix || host.endsWith(`.${suffix}`))
    );
    if (matchedRule !== undefined) {
      return config.udpServers.find((server) => server.tag === matchedRule.serverTag);
    }
    return config.udpServers[0];
  }
}

const queryUdpA = async (
  host: string,
  server: DnsUdpServerConfig,
  signal?: AbortSignal
): Promise<DnsAResult> => {
  const socket = dgram.createSocket(net.isIP(server.address) === 6 ? "udp6" : "udp4");
  const id = Math.floor(Math.random() * 0xffff);
  const packet = encodeDnsQuery(id, host);
  return await new Promise<DnsAResult>((resolve, reject) => {
    let settled = false;
    const cleanup = (): void => {
      clearTimeout(timer);
      socket.removeListener("message", onMessage);
      socket.removeListener("error", onError);
      signal?.removeEventListener("abort", onAbort);
      try {
        socket.close();
      } catch {
        // The socket may have failed before it was bound.
      }
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };
    const onMessage = (message: Buffer, rinfo: dgram.RemoteInfo): void => {
      if (
        rinfo.port !== server.port ||
        (net.isIP(server.address) !== 0 && rinfo.address !== server.address)
      ) {
        return;
      }
      try {
        const result = decodeDnsAResponse(message, id);
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      } catch (error) {
        fail(error instanceof Error ? error : new NetworkError(String(error)));
      }
    };
    const onError = (error: Error): void => {
      fail(new NetworkError("UDP DNS socket error", { cause: error }));
    };
    const onAbort = (): void => {
      fail(new NetworkError(`UDP DNS query aborted for ${host}`));
    };
    const timer = setTimeout(() => {
      fail(new TimeoutError(`UDP DNS query timeout after ${server.timeoutMs}ms for ${host}`));
    }, server.timeoutMs);
    timer.unref();
    socket.once("message", onMessage);
    socket.once("error", onError);
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted === true) {
      onAbort();
      return;
    }
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
