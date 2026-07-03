import { createHash } from "node:crypto";
import type { RoutingPolicyConfig } from "../config/types.js";
import { ConfigError } from "../utils/errors.js";
import {
  RoutingPolicyManager,
  type OutboundHealthSnapshot,
  type RoutingPolicySelection
} from "./policy.js";

export interface PolicyGenerationOptions {
  readonly id: string;
  readonly sequence: number;
  readonly policies: readonly RoutingPolicyConfig[];
  readonly outboundTags: ReadonlySet<string>;
  readonly healthSnapshot?: readonly OutboundHealthSnapshot[];
  readonly createdAt?: number;
}

export interface PolicyLatencySnapshot {
  readonly tag: string;
  readonly latencyEwmaMs: number;
}

export class PolicyGeneration {
  public readonly id: string;
  public readonly sequence: number;
  public readonly configHash: string;
  public readonly createdAt: number;
  public readonly policies: readonly RoutingPolicyConfig[];
  public readonly healthSnapshot: readonly OutboundHealthSnapshot[];
  public readonly latencySnapshot: readonly PolicyLatencySnapshot[];

  public constructor(options: PolicyGenerationOptions) {
    validatePolicies(options.policies, options.outboundTags);
    const referenced = new Set(options.policies.flatMap((policy) => policy.outbounds));
    this.id = options.id;
    this.sequence = options.sequence;
    this.createdAt = options.createdAt ?? Date.now();
    this.policies = freezeValue(structuredClone(options.policies)) as readonly RoutingPolicyConfig[];
    this.healthSnapshot = freezeValue(
      structuredClone((options.healthSnapshot ?? []).filter((snapshot) => referenced.has(snapshot.tag)))
    ) as readonly OutboundHealthSnapshot[];
    this.latencySnapshot = Object.freeze(
      this.healthSnapshot
        .filter((snapshot) => snapshot.latencyEwmaMs !== undefined)
        .map((snapshot) => Object.freeze({
          tag: snapshot.tag,
          latencyEwmaMs: snapshot.latencyEwmaMs ?? 0
        }))
    );
    this.configHash = createHash("sha256").update(stableJson(this.policies)).digest("hex");
    Object.freeze(this);
  }

  public createManager(): RoutingPolicyManager {
    return new RoutingPolicyManager(this.policies, this.healthSnapshot);
  }

  public selectForHealthCheck(tag: string): RoutingPolicySelection {
    return this.createManager().select(tag);
  }
}

const validatePolicies = (
  policies: readonly RoutingPolicyConfig[],
  outboundTags: ReadonlySet<string>
): void => {
  const policyTypes = new Set<string>(["loadBalance", "failover"]);
  const strategies = new Set<string>(["roundRobin", "leastLatency", "random"]);
  const tags = new Set<string>();
  for (const policy of policies) {
    if (!policyTypes.has(policy.type)) {
      throw new ConfigError(`policy generation "${policy.tag}" has unsupported type "${policy.type}"`);
    }
    if (!strategies.has(policy.strategy)) {
      throw new ConfigError(
        `policy generation "${policy.tag}" has unsupported strategy "${policy.strategy}"`
      );
    }
    if (tags.has(policy.tag) || outboundTags.has(policy.tag)) {
      throw new ConfigError(`policy generation contains duplicate or colliding tag "${policy.tag}"`);
    }
    tags.add(policy.tag);
    if (policy.outbounds.length === 0) {
      throw new ConfigError(`policy generation "${policy.tag}" must contain at least one outbound`);
    }
    for (const outbound of policy.outbounds) {
      if (!outboundTags.has(outbound)) {
        throw new ConfigError(
          `policy generation "${policy.tag}" references unavailable outbound "${outbound}"`
        );
      }
    }
  }
};

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
