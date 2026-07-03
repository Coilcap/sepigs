import net from "node:net";
import type { SepigsConfig } from "../../config/types.js";
import {
  applyDnsCacheCarryover,
  planDnsCacheCarryover,
  type DnsCacheCarryoverPlan
} from "../../dns/cacheCarryover.js";
import {
  DNSGeneration,
  fakeIpConfigEqual,
  type DnsFailureCountersSnapshot
} from "../../dns/generation.js";
import type { DNSGenerationStore } from "../../dns/generationStore.js";
import { ConfigError } from "../../utils/errors.js";
import type {
  PreparedComponent,
  ReloadableComponent,
  ReloadOperationContext
} from "../contract.js";

export interface DnsRuntimeHost {
  dnsGenerationStore(): DNSGenerationStore;
  dnsFailureCountersSnapshot(): DnsFailureCountersSnapshot;
}

interface DnsRuntimePrepared {
  readonly oldGeneration: DNSGeneration;
  readonly candidateGeneration: DNSGeneration;
  readonly carryover: DnsCacheCarryoverPlan;
  committed: boolean;
}

export class DnsRuntimeAdapter implements ReloadableComponent<DnsRuntimePrepared> {
  public readonly name = "dns" as const;

  public constructor(private readonly host: DnsRuntimeHost) {}

  public currentGeneration(): string {
    return this.host.dnsGenerationStore().active().id;
  }

  public prepare(
    config: SepigsConfig,
    context: ReloadOperationContext
  ): Promise<PreparedComponent<DnsRuntimePrepared>> {
    const store = this.host.dnsGenerationStore();
    const oldGeneration = store.active();
    if (!fakeIpConfigEqual(oldGeneration.config.fakeIp, config.dns.fakeIp)) {
      store.recordRejectedFakeIpChange();
      throw new ConfigError(
        "DNS-only transactional reload rejected unsupported high-risk fake-IP configuration change"
      );
    }
    validateDnsConfig(config);
    const carryover = planDnsCacheCarryover(oldGeneration, config.dns);
    const candidateGeneration = new DNSGeneration({
      id: `${context.candidateGenerationId}-dns`,
      sequence: oldGeneration.sequence + 1,
      config: config.dns,
      failureCountersSnapshot: this.host.dnsFailureCountersSnapshot()
    });
    applyDnsCacheCarryover(candidateGeneration, carryover);
    return Promise.resolve({
      component: this.name,
      candidateGenerationId: context.candidateGenerationId,
      preparedAt: Date.now(),
      value: {
        oldGeneration,
        candidateGeneration,
        carryover,
        committed: false
      },
      resources: [],
      rollbackFailureStrategy: "keep-old-generation"
    });
  }

  public healthCheck(prepared: PreparedComponent<DnsRuntimePrepared>): Promise<void> {
    const candidate = prepared.value.candidateGeneration;
    if (candidate.configHash.length !== 64 || candidate.upstreamHash.length !== 64) {
      return Promise.reject(new Error("DNS candidate generation hash is invalid"));
    }
    for (const rule of candidate.config.rules) {
      const selected = candidate.config.udpServers.find(
        (server) => server.tag === rule.serverTag
      );
      if (selected === undefined) {
        return Promise.reject(
          new Error(`DNS candidate rule references missing server "${rule.serverTag}"`)
        );
      }
    }
    return Promise.resolve();
  }

  public commit(prepared: PreparedComponent<DnsRuntimePrepared>): Promise<void> {
    const store = this.host.dnsGenerationStore();
    store.switchTo(prepared.value.candidateGeneration);
    store.recordCacheCarryover(
      prepared.value.carryover.carried,
      prepared.value.carryover.dropped
    );
    prepared.value.committed = true;
    return Promise.resolve();
  }

  public rollback(prepared: PreparedComponent<DnsRuntimePrepared>): Promise<void> {
    if (prepared.value.committed) {
      this.host.dnsGenerationStore().restore(
        prepared.value.oldGeneration,
        prepared.value.candidateGeneration
      );
    }
    prepared.value.committed = false;
    return Promise.resolve();
  }

  public cleanup(prepared: PreparedComponent<DnsRuntimePrepared>): Promise<void> {
    if (!prepared.value.committed) prepared.value.candidateGeneration.abortInFlight();
    this.host.dnsGenerationStore().releaseDrained();
    return Promise.resolve();
  }
}

const validateDnsConfig = (config: SepigsConfig): void => {
  const dns = config.dns;
  if (dns.doh.enabled && dns.doh.endpoints.length === 0) {
    throw new ConfigError("DNS candidate enables DoH without an endpoint");
  }
  for (const endpoint of dns.doh.endpoints) {
    let url: URL;
    try {
      url = new URL(endpoint);
    } catch {
      throw new ConfigError("DNS candidate contains an invalid DoH endpoint URL");
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      throw new ConfigError(
        `DNS candidate DoH endpoint uses unsupported scheme "${url.protocol}"`
      );
    }
    if (url.username.length > 0 || url.password.length > 0 || url.hash.length > 0) {
      throw new ConfigError(
        "DNS candidate DoH endpoint must not contain credentials or a fragment"
      );
    }
    if (url.protocol === "http:" && !isLoopbackHost(url.hostname)) {
      throw new ConfigError(
        "DNS candidate permits plaintext DoH only for loopback health fixtures"
      );
    }
  }
  const tags = new Set<string>();
  for (const server of dns.udpServers) {
    if (tags.has(server.tag)) {
      throw new ConfigError(`DNS candidate contains duplicate UDP server tag "${server.tag}"`);
    }
    tags.add(server.tag);
    if (server.address.trim().length === 0 || /\s/u.test(server.address)) {
      throw new ConfigError(`DNS candidate UDP server "${server.tag}" has invalid address`);
    }
  }
  for (const rule of dns.rules) {
    if (!tags.has(rule.serverTag)) {
      throw new ConfigError(
        `DNS candidate rule references missing UDP server "${rule.serverTag}"`
      );
    }
  }
};

const isLoopbackHost = (host: string): boolean =>
  host === "localhost" ||
  host === "::1" ||
  host === "[::1]" ||
  (net.isIPv4(host) && host.startsWith("127."));
