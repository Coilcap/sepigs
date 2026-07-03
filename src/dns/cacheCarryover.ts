import type { DnsConfig } from "../config/types.js";
import { ConfigError } from "../utils/errors.js";
import {
  type DNSGeneration,
  type NegativeDnsCacheEntry,
  type PositiveDnsCacheEntry,
  dnsResolverCompatibilityHash,
  fakeIpConfigEqual
} from "./generation.js";

export interface DnsCacheCarryoverPlan {
  readonly allowed: boolean;
  readonly reason: string;
  readonly positiveEntries: readonly PositiveDnsCacheEntry[];
  readonly negativeEntries: readonly NegativeDnsCacheEntry[];
  readonly carried: number;
  readonly dropped: number;
}

export const planDnsCacheCarryover = (
  current: DNSGeneration,
  candidateConfig: DnsConfig,
  options: {
    readonly now?: number;
    readonly carryNegative?: boolean;
  } = {}
): DnsCacheCarryoverPlan => {
  if (!fakeIpConfigEqual(current.config.fakeIp, candidateConfig.fakeIp)) {
    throw new ConfigError(
      "DNS-only transactional reload rejected high-risk fake-IP configuration change"
    );
  }

  const now = options.now ?? Date.now();
  const currentPositive = [...current.cache.values()];
  const currentNegative = [...current.negativeCache.values()];
  const candidateLimit = candidateConfig.cacheMaxEntries ?? 4_096;
  const sameResolver =
    current.upstreamHash === dnsResolverCompatibilityHash(candidateConfig);
  const fakeIpDisabled =
    !current.config.fakeIp.enabled && !candidateConfig.fakeIp.enabled;
  if (!sameResolver || !fakeIpDisabled) {
    return {
      allowed: false,
      reason: !sameResolver ? "resolver-identity-changed" : "fake-ip-enabled",
      positiveEntries: [],
      negativeEntries: [],
      carried: 0,
      dropped: currentPositive.length + currentNegative.length
    };
  }

  const eligiblePositive = currentPositive
    .filter((entry) =>
      entry.expiresAt > now && !entry.sensitive && !entry.synthetic
    )
    .map((entry): PositiveDnsCacheEntry => ({
      ...entry,
      expiresAt: Math.min(entry.expiresAt, now + candidateConfig.cacheTtlMs),
      touchedAt: now
    }));
  const positiveEntries = eligiblePositive.slice(
    Math.max(0, eligiblePositive.length - candidateLimit)
  );
  const negativeEntries = options.carryNegative === true
    ? currentNegative
        .filter((entry) =>
          entry.expiresAt > now && !entry.sensitive && !entry.synthetic
        )
        .map((entry): NegativeDnsCacheEntry => ({
          ...entry,
          expiresAt: Math.min(
            entry.expiresAt,
            now + (candidateConfig.negativeTtlMs ?? 5_000)
          ),
          touchedAt: now
        }))
        .slice(0, Math.max(0, candidateLimit - positiveEntries.length))
    : [];
  const carried = positiveEntries.length + negativeEntries.length;
  return {
    allowed: true,
    reason: "compatible-resolver",
    positiveEntries,
    negativeEntries,
    carried,
    dropped: currentPositive.length + currentNegative.length - carried
  };
};

export const applyDnsCacheCarryover = (
  candidate: DNSGeneration,
  plan: DnsCacheCarryoverPlan
): void => {
  for (const entry of plan.positiveEntries) candidate.setPositive(entry);
  for (const entry of plan.negativeEntries) candidate.setNegative(entry);
};
