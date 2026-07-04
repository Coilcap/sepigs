import type { RouterConfig } from "../config/types.js";
import { ConfigError } from "../utils/errors.js";
import { PolicyGeneration } from "./policyGeneration.js";
import type { RoutingPolicyManager } from "./policy.js";
import { RouterGeneration } from "./routerGeneration.js";

export type RoutingComponent = "router" | "policy" | "outbound";

export interface RoutingGenerationPair {
  readonly router: RouterGeneration;
  readonly policy: PolicyGeneration;
  readonly policyManager: RoutingPolicyManager;
}

export interface RoutingGenerationHandle {
  readonly generation: RoutingGenerationPair;
  release(): void;
}

interface RoutingTransaction {
  readonly oldGeneration: RoutingGenerationPair;
  readonly expected: ReadonlySet<RoutingComponent>;
  readonly committed: Set<RoutingComponent>;
  routerCandidate?: RouterGeneration;
  policyCandidate?: PolicyGeneration;
  published: boolean;
}

export class RoutingGenerationRuntime {
  private activeGeneration: RoutingGenerationPair;
  private readonly transactions = new Map<string, RoutingTransaction>();
  private readonly usage = new Map<string, number>();
  private readonly draining = new Map<string, RoutingGenerationPair>();

  public constructor(initial: RoutingGenerationPair) {
    this.activeGeneration = initial;
  }

  public active(): RoutingGenerationPair {
    return this.activeGeneration;
  }

  public acquire(): RoutingGenerationHandle {
    const generation = this.activeGeneration;
    const key = pairKey(generation);
    this.usage.set(key, (this.usage.get(key) ?? 0) + 1);
    let released = false;
    return {
      generation,
      release: () => {
        if (released) return;
        released = true;
        const remaining = Math.max(0, (this.usage.get(key) ?? 1) - 1);
        if (remaining === 0) {
          this.usage.delete(key);
          this.draining.delete(key);
        } else {
          this.usage.set(key, remaining);
        }
      }
    };
  }

  public begin(transactionId: string, expected: readonly RoutingComponent[]): void {
    const existing = this.transactions.get(transactionId);
    if (existing !== undefined) return;
    if (expected.length === 0) throw new ConfigError("routing transaction requires a component");
    this.transactions.set(transactionId, {
      oldGeneration: this.activeGeneration,
      expected: new Set(expected),
      committed: new Set(),
      published: false
    });
  }

  public stageRouter(transactionId: string, candidate: RouterGeneration): void {
    this.requireTransaction(transactionId).routerCandidate = candidate;
  }

  public stagePolicy(transactionId: string, candidate: PolicyGeneration): void {
    this.requireTransaction(transactionId).policyCandidate = candidate;
  }

  public commit(transactionId: string, component: RoutingComponent): void {
    const transaction = this.requireTransaction(transactionId);
    if (!transaction.expected.has(component)) {
      throw new ConfigError(`routing transaction did not expect component "${component}"`);
    }
    if (component === "router" && transaction.routerCandidate === undefined) {
      throw new ConfigError("routing transaction has no router candidate");
    }
    if (component === "policy" && transaction.policyCandidate === undefined) {
      throw new ConfigError("routing transaction has no policy candidate");
    }
    transaction.committed.add(component);
    if ([...transaction.expected].some((expected) => !transaction.committed.has(expected))) return;

    const nextPolicy = transaction.policyCandidate ?? transaction.oldGeneration.policy;
    const next: RoutingGenerationPair = Object.freeze({
      router: transaction.routerCandidate ?? transaction.oldGeneration.router,
      policy: nextPolicy,
      policyManager: transaction.policyCandidate === undefined
        ? transaction.oldGeneration.policyManager
        : nextPolicy.createManager()
    });
    const old = this.activeGeneration;
    this.activeGeneration = next;
    this.draining.set(pairKey(old), old);
    transaction.published = true;
  }

  public rollback(transactionId: string): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction === undefined) return;
    if (transaction.published) {
      const candidateKey = pairKey(this.activeGeneration);
      this.activeGeneration = transaction.oldGeneration;
      this.draining.delete(pairKey(transaction.oldGeneration));
      this.draining.delete(candidateKey);
      transaction.published = false;
    }
  }

  public cleanup(transactionId: string): void {
    const transaction = this.transactions.get(transactionId);
    if (transaction === undefined) return;
    if (transaction.published) {
      const oldKey = pairKey(transaction.oldGeneration);
      if ((this.usage.get(oldKey) ?? 0) === 0) this.draining.delete(oldKey);
    }
    this.transactions.delete(transactionId);
  }

  public isDrainingRouter(id: string): boolean {
    return [...this.draining.values()].some((generation) => generation.router.id === id);
  }

  public replaceLegacy(next: RoutingGenerationPair): void {
    const old = this.activeGeneration;
    this.activeGeneration = next;
    const oldKey = pairKey(old);
    if ((this.usage.get(oldKey) ?? 0) > 0) this.draining.set(oldKey, old);
  }

  private requireTransaction(transactionId: string): RoutingTransaction {
    const transaction = this.transactions.get(transactionId);
    if (transaction === undefined) {
      throw new ConfigError(`routing transaction "${transactionId}" was not initialized`);
    }
    return transaction;
  }
}

export const createRoutingGenerationPair = (options: {
  readonly idPrefix: string;
  readonly sequence: number;
  readonly route: RouterConfig;
  readonly outboundTags: ReadonlySet<string>;
  readonly healthSnapshot?: ReturnType<RoutingPolicyManager["getHealthSnapshots"]>;
}): RoutingGenerationPair => {
  const policy = new PolicyGeneration({
    id: `${options.idPrefix}-policy`,
    sequence: options.sequence,
    policies: options.route.policies,
    outboundTags: options.outboundTags,
    ...(options.healthSnapshot === undefined ? {} : { healthSnapshot: options.healthSnapshot })
  });
  const router = new RouterGeneration({
    id: `${options.idPrefix}-router`,
    sequence: options.sequence,
    config: options.route,
    allowedTargets: new Set([
      ...options.outboundTags,
      ...options.route.policies.map((item) => item.tag)
    ])
  });
  return Object.freeze({
    router,
    policy,
    policyManager: policy.createManager()
  });
};

const pairKey = (generation: RoutingGenerationPair): string =>
  `${generation.router.id}:${generation.policy.id}`;
