import type { RoutingPolicyConfig } from "../config/types.js";

interface OutboundHealth {
  readonly tag: string;
  failures: number;
  lastFailureAt: number | undefined;
  latencyEwmaMs: number | undefined;
  successes: number;
}

export interface RoutingPolicySelection {
  readonly requestedTag: string;
  readonly policyTag?: string;
  readonly candidates: readonly string[];
}

export interface RoutingPolicySnapshot {
  readonly tag: string;
  readonly type: RoutingPolicyConfig["type"];
  readonly strategy: RoutingPolicyConfig["strategy"];
  readonly outbounds: readonly string[];
  readonly healthyOutbounds: readonly string[];
}

export interface OutboundHealthSnapshot {
  readonly tag: string;
  readonly failures: number;
  readonly successes: number;
  readonly lastFailureAt?: number;
  readonly latencyEwmaMs?: number;
}

export interface LatencyProbeResult {
  readonly tag: string;
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly error?: string;
}

type ProbeFunction = (tag: string) => Promise<void>;

export class RoutingPolicyManager {
  private policies = new Map<string, RoutingPolicyConfig>();
  private readonly health = new Map<string, OutboundHealth>();
  private readonly roundRobinIndex = new Map<string, number>();

  public constructor(
    policies: readonly RoutingPolicyConfig[],
    initialHealth: readonly OutboundHealthSnapshot[] = []
  ) {
    for (const snapshot of initialHealth) {
      this.health.set(snapshot.tag, {
        tag: snapshot.tag,
        failures: snapshot.failures,
        lastFailureAt: snapshot.lastFailureAt,
        latencyEwmaMs: snapshot.latencyEwmaMs,
        successes: snapshot.successes
      });
    }
    this.reload(policies);
  }

  public reload(policies: readonly RoutingPolicyConfig[]): void {
    this.policies = new Map(policies.map((policy) => [policy.tag, policy]));
    for (const policy of policies) {
      for (const outboundTag of policy.outbounds) {
        this.getHealth(outboundTag);
      }
    }
  }

  public select(tag: string): RoutingPolicySelection {
    const policy = this.policies.get(tag);
    if (policy === undefined) {
      return {
        requestedTag: tag,
        candidates: [tag]
      };
    }

    const candidates = policy.type === "failover" ? this.selectFailover(policy) : this.selectLoadBalance(policy);
    return {
      requestedTag: tag,
      policyTag: policy.tag,
      candidates
    };
  }

  public recordSuccess(outboundTag: string, latencyMs: number): void {
    const health = this.getHealth(outboundTag);
    health.failures = 0;
    health.lastFailureAt = undefined;
    health.successes += 1;
    health.latencyEwmaMs = health.latencyEwmaMs === undefined ? latencyMs : health.latencyEwmaMs * 0.8 + latencyMs * 0.2;
  }

  public recordFailure(outboundTag: string): void {
    const health = this.getHealth(outboundTag);
    health.failures += 1;
    health.lastFailureAt = Date.now();
  }

  public getPolicySnapshots(): readonly RoutingPolicySnapshot[] {
    return [...this.policies.values()].map((policy) => ({
      tag: policy.tag,
      type: policy.type,
      strategy: policy.strategy,
      outbounds: policy.outbounds,
      healthyOutbounds: policy.outbounds.filter((outboundTag) => this.isHealthy(outboundTag, policy))
    }));
  }

  public getHealthSnapshots(): readonly OutboundHealthSnapshot[] {
    return [...this.health.values()].map((health) => ({
      tag: health.tag,
      failures: health.failures,
      successes: health.successes,
      ...(health.lastFailureAt === undefined ? {} : { lastFailureAt: health.lastFailureAt }),
      ...(health.latencyEwmaMs === undefined ? {} : { latencyEwmaMs: health.latencyEwmaMs })
    }));
  }

  private selectFailover(policy: RoutingPolicyConfig): readonly string[] {
    const healthy = policy.outbounds.filter((outboundTag) => this.isHealthy(outboundTag, policy));
    const unhealthy = policy.outbounds.filter((outboundTag) => !healthy.includes(outboundTag));
    return [...healthy, ...unhealthy];
  }

  private selectLoadBalance(policy: RoutingPolicyConfig): readonly string[] {
    const healthy = policy.outbounds.filter((outboundTag) => this.isHealthy(outboundTag, policy));
    const pool = healthy.length > 0 ? healthy : policy.outbounds;
    if (pool.length === 0) {
      return [];
    }

    const first = this.pickLoadBalanceFirst(policy, pool);
    const rest = pool.filter((outboundTag) => outboundTag !== first);
    const unhealthy = policy.outbounds.filter((outboundTag) => !pool.includes(outboundTag));
    return [first, ...rest, ...unhealthy];
  }

  private pickLoadBalanceFirst(policy: RoutingPolicyConfig, pool: readonly string[]): string {
    if (policy.strategy === "leastLatency") {
      return [...pool].sort((left, right) => this.latencyScore(left) - this.latencyScore(right))[0] ?? pool[0] ?? policy.outbounds[0] ?? "";
    }
    if (policy.strategy === "random") {
      return pool[Math.floor(Math.random() * pool.length)] ?? pool[0] ?? "";
    }

    const current = this.roundRobinIndex.get(policy.tag) ?? 0;
    this.roundRobinIndex.set(policy.tag, current + 1);
    return pool[current % pool.length] ?? pool[0] ?? "";
  }

  private latencyScore(outboundTag: string): number {
    return this.getHealth(outboundTag).latencyEwmaMs ?? Number.POSITIVE_INFINITY;
  }

  private isHealthy(outboundTag: string, policy: RoutingPolicyConfig): boolean {
    const health = this.getHealth(outboundTag);
    if (health.failures < policy.unhealthyAfterFailures) {
      return true;
    }
    if (health.lastFailureAt === undefined) {
      return true;
    }
    return Date.now() - health.lastFailureAt >= policy.recoverAfterMs;
  }

  private getHealth(tag: string): OutboundHealth {
    const existing = this.health.get(tag);
    if (existing !== undefined) {
      return existing;
    }
    const created: OutboundHealth = {
      tag,
      failures: 0,
      lastFailureAt: undefined,
      latencyEwmaMs: undefined,
      successes: 0
    };
    this.health.set(tag, created);
    return created;
  }
}

export class LatencyProbe {
  private readonly policyManager: RoutingPolicyManager;

  public constructor(policyManager: RoutingPolicyManager) {
    this.policyManager = policyManager;
  }

  public async probe(tag: string, probe: ProbeFunction): Promise<LatencyProbeResult> {
    const startedAt = performance.now();
    try {
      await probe(tag);
      const latencyMs = performance.now() - startedAt;
      this.policyManager.recordSuccess(tag, latencyMs);
      return { tag, ok: true, latencyMs };
    } catch (error) {
      const latencyMs = performance.now() - startedAt;
      this.policyManager.recordFailure(tag);
      return {
        tag,
        ok: false,
        latencyMs,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  public async probeAll(tags: readonly string[], probe: ProbeFunction): Promise<readonly LatencyProbeResult[]> {
    return await Promise.all(tags.map(async (tag) => await this.probe(tag, probe)));
  }
}
