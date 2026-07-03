import { createHmac, randomBytes } from "node:crypto";
import type { DnsConfig, DnsUdpServerConfig } from "../config/types.js";
import { GenerationSingleFlight } from "./singleFlight.js";

export type DnsResolverMode = "system" | "udp" | "doh";
export type DnsCacheSource = "system" | "udp" | "doh";

export interface PositiveDnsCacheEntry {
  readonly host: string;
  readonly address: string;
  readonly expiresAt: number;
  readonly touchedAt: number;
  readonly source: DnsCacheSource;
  readonly sensitive: boolean;
  readonly synthetic: boolean;
}

export interface NegativeDnsCacheEntry {
  readonly host: string;
  readonly message: string;
  readonly expiresAt: number;
  readonly touchedAt: number;
  readonly source: DnsCacheSource;
  readonly sensitive: boolean;
  readonly synthetic: boolean;
}

export interface DnsFailureCountersSnapshot {
  readonly queries: number;
  readonly failures: number;
}

export interface DnsGenerationOptions {
  readonly id: string;
  readonly sequence: number;
  readonly config: DnsConfig;
  readonly failureCountersSnapshot?: DnsFailureCountersSnapshot;
  readonly createdAt?: number;
}

interface DnsGenerationRuntimeState {
  readonly positiveCache: Map<string, PositiveDnsCacheEntry>;
  readonly negativeCache: Map<string, NegativeDnsCacheEntry>;
  readonly singleFlight: GenerationSingleFlight<string>;
  queryRefs: number;
  draining: boolean;
}

const HASH_KEY = randomBytes(32);

export class DNSGeneration {
  public readonly id: string;
  public readonly sequence: number;
  public readonly configHash: string;
  public readonly upstreamHash: string;
  public readonly createdAt: number;
  public readonly config: DnsConfig;
  public readonly upstreams: readonly string[];
  public readonly dohUpstreams: readonly string[];
  public readonly mode: DnsResolverMode;
  public readonly cachePolicy: Readonly<{
    maxEntries: number;
    ttlMs: number;
  }>;
  public readonly negativeCachePolicy: Readonly<{
    ttlMs: number;
    carryOverByDefault: false;
  }>;
  public readonly singleFlightPolicy: Readonly<{
    keyIncludesGeneration: true;
    crossGenerationMerge: false;
  }>;
  public readonly fallbackPolicy: Readonly<{
    hosts: Readonly<Record<string, string>>;
  }>;
  public readonly timeoutPolicy: Readonly<{
    dohTimeoutMs: number;
    udpTimeoutMs: readonly number[];
  }>;
  public readonly failureCountersSnapshot: DnsFailureCountersSnapshot;
  private readonly state: DnsGenerationRuntimeState;

  public constructor(options: DnsGenerationOptions) {
    this.id = options.id;
    this.sequence = options.sequence;
    this.createdAt = options.createdAt ?? Date.now();
    this.config = freezeValue(structuredClone(options.config)) as DnsConfig;
    this.mode = dnsResolverMode(this.config);
    this.upstreams = Object.freeze([
      "system",
      ...this.config.udpServers.map(udpIdentity)
    ]);
    this.dohUpstreams = Object.freeze(
      this.config.doh.endpoints.map(redactDohEndpoint)
    );
    this.cachePolicy = Object.freeze({
      maxEntries: this.config.cacheMaxEntries ?? 4_096,
      ttlMs: this.config.cacheTtlMs
    });
    this.negativeCachePolicy = Object.freeze({
      ttlMs: this.config.negativeTtlMs ?? 5_000,
      carryOverByDefault: false as const
    });
    this.singleFlightPolicy = Object.freeze({
      keyIncludesGeneration: true as const,
      crossGenerationMerge: false as const
    });
    this.fallbackPolicy = Object.freeze({
      hosts: this.config.fallbackHosts
    });
    this.timeoutPolicy = Object.freeze({
      dohTimeoutMs: this.config.doh.timeoutMs,
      udpTimeoutMs: Object.freeze(
        this.config.udpServers.map((server) => server.timeoutMs)
      )
    });
    this.failureCountersSnapshot = Object.freeze({
      queries: options.failureCountersSnapshot?.queries ?? 0,
      failures: options.failureCountersSnapshot?.failures ?? 0
    });
    this.configHash = keyedHash(dnsConfigView(this.config));
    this.upstreamHash = dnsResolverCompatibilityHash(this.config);
    this.state = {
      positiveCache: new Map(),
      negativeCache: new Map(),
      singleFlight: new GenerationSingleFlight<string>(this.id),
      queryRefs: 0,
      draining: false
    };
    Object.freeze(this);
  }

  public get cache(): ReadonlyMap<string, PositiveDnsCacheEntry> {
    return new Map(
      [...this.state.positiveCache].map(([key, value]) => [key, { ...value }])
    );
  }

  public get negativeCache(): ReadonlyMap<string, NegativeDnsCacheEntry> {
    return new Map(
      [...this.state.negativeCache].map(([key, value]) => [key, { ...value }])
    );
  }

  public get inFlight(): number {
    return this.state.singleFlight.size();
  }

  public get positiveCacheSize(): number {
    return this.state.positiveCache.size;
  }

  public get negativeCacheSize(): number {
    return this.state.negativeCache.size;
  }

  public get queryRefs(): number {
    return this.state.queryRefs;
  }

  public get draining(): boolean {
    return this.state.draining;
  }

  public getPositive(host: string, now = Date.now()): PositiveDnsCacheEntry | undefined {
    const normalized = host.toLowerCase();
    const entry = this.state.positiveCache.get(normalized);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= now) {
      this.state.positiveCache.delete(normalized);
      return undefined;
    }
    const touched = { ...entry, touchedAt: now };
    this.state.positiveCache.delete(normalized);
    this.state.positiveCache.set(normalized, touched);
    return { ...touched };
  }

  public getNegative(host: string, now = Date.now()): NegativeDnsCacheEntry | undefined {
    const normalized = host.toLowerCase();
    const entry = this.state.negativeCache.get(normalized);
    if (entry === undefined) return undefined;
    if (entry.expiresAt <= now) {
      this.state.negativeCache.delete(normalized);
      return undefined;
    }
    const touched = { ...entry, touchedAt: now };
    this.state.negativeCache.delete(normalized);
    this.state.negativeCache.set(normalized, touched);
    return { ...touched };
  }

  public setPositive(entry: PositiveDnsCacheEntry): void {
    const normalized = entry.host.toLowerCase();
    this.state.negativeCache.delete(normalized);
    this.state.positiveCache.delete(normalized);
    this.state.positiveCache.set(normalized, {
      ...entry,
      host: normalized
    });
    this.trimCache();
  }

  public setNegative(entry: NegativeDnsCacheEntry): void {
    const normalized = entry.host.toLowerCase();
    this.state.positiveCache.delete(normalized);
    this.state.negativeCache.delete(normalized);
    this.state.negativeCache.set(normalized, {
      ...entry,
      host: normalized
    });
    this.trimCache();
  }

  public runSingleFlight(
    key: string,
    operation: (signal: AbortSignal) => Promise<string>,
    timeoutMs?: number
  ): Promise<string> {
    return this.state.singleFlight.run(key, operation, timeoutMs);
  }

  public beginQuery(): void {
    this.state.queryRefs += 1;
  }

  public endQuery(): void {
    this.state.queryRefs = Math.max(0, this.state.queryRefs - 1);
  }

  public markDraining(): void {
    this.state.draining = true;
  }

  public markActive(): void {
    this.state.draining = false;
  }

  public isReleasable(): boolean {
    return this.state.draining && this.state.queryRefs === 0 && this.inFlight === 0;
  }

  public abortInFlight(): void {
    this.state.singleFlight.abortAll();
  }

  private trimCache(): void {
    while (
      this.state.positiveCache.size + this.state.negativeCache.size >
      this.cachePolicy.maxEntries
    ) {
      const positive = this.state.positiveCache.values().next().value;
      const negative = this.state.negativeCache.values().next().value;
      if (positive === undefined && negative === undefined) return;
      if (
        negative === undefined ||
        (positive !== undefined && positive.touchedAt <= negative.touchedAt)
      ) {
        if (positive !== undefined) this.state.positiveCache.delete(positive.host);
      } else {
        this.state.negativeCache.delete(negative.host);
      }
    }
  }
}

export const dnsResolverMode = (config: DnsConfig): DnsResolverMode => {
  if (
    config.strategy !== "prefer-ipv6" &&
    config.doh.enabled &&
    config.doh.endpoints.length > 0
  ) {
    return "doh";
  }
  if (config.strategy !== "prefer-ipv6" && config.udpServers.length > 0) {
    return "udp";
  }
  return "system";
};

export const dnsResolverCompatibilityHash = (config: DnsConfig): string =>
  keyedHash({
    mode: dnsResolverMode(config),
    strategy: config.strategy,
    hosts: config.hosts,
    udpServers: config.udpServers,
    rules: config.rules,
    fallbackHosts: config.fallbackHosts,
    doh: config.doh
  });

export const fakeIpConfigEqual = (
  left: DnsConfig["fakeIp"],
  right: DnsConfig["fakeIp"]
): boolean => stableJson(left) === stableJson(right);

const dnsConfigView = (config: DnsConfig): unknown => ({
  strategy: config.strategy,
  cacheTtlMs: config.cacheTtlMs,
  cacheMaxEntries: config.cacheMaxEntries,
  negativeTtlMs: config.negativeTtlMs,
  hosts: config.hosts,
  udpServers: config.udpServers,
  rules: config.rules,
  fallbackHosts: config.fallbackHosts,
  doh: config.doh
});

const udpIdentity = (server: DnsUdpServerConfig): string =>
  `${server.tag}@${server.address}:${String(server.port)}`;

const redactDohEndpoint = (endpoint: string): string => {
  try {
    const url = new URL(endpoint);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return "<invalid-doh-endpoint>";
  }
};

const keyedHash = (value: unknown): string =>
  createHmac("sha256", HASH_KEY).update(stableJson(value)).digest("hex");

const stableJson = (value: unknown): string => JSON.stringify(sortValue(value));

const sortValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(sortValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, sortValue(child)])
  );
};

const freezeValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    value.forEach(freezeValue);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(freezeValue);
    return Object.freeze(value);
  }
  return value;
};
