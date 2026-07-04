import type { SepigsConfig } from "../../config/types.js";
import type { RoutingComponent } from "../../router/generation.js";
import { PolicyGeneration } from "../../router/policyGeneration.js";
import type {
  PreparedComponent,
  ReloadableComponent,
  ReloadOperationContext
} from "../contract.js";
import type { RouterPolicyRuntimeHost } from "./routerRuntimeAdapter.js";

interface PolicyRuntimePrepared {
  readonly oldGeneration: PolicyGeneration;
  readonly candidateGeneration: PolicyGeneration;
  readonly transactionId: string;
  committed: boolean;
}

export class PolicyRuntimeAdapter implements ReloadableComponent<PolicyRuntimePrepared> {
  public readonly name = "policy-prober" as const;

  public constructor(
    private readonly host: RouterPolicyRuntimeHost,
    private readonly expectedRoutingComponents: readonly RoutingComponent[]
  ) {}

  public currentGeneration(): string {
    return this.host.routingRuntime().active().policy.id;
  }

  public prepare(
    config: SepigsConfig,
    context: ReloadOperationContext
  ): Promise<PreparedComponent<PolicyRuntimePrepared>> {
    const runtime = this.host.routingRuntime();
    const active = runtime.active();
    const oldGeneration = active.policy;
    const candidateGeneration = new PolicyGeneration({
      id: `${context.candidateGenerationId}-policy`,
      sequence: oldGeneration.sequence + 1,
      policies: config.route.policies,
      outboundTags: this.host.outboundTags(config),
      healthSnapshot: active.policyManager.getHealthSnapshots()
    });
    runtime.begin(context.transactionId, this.expectedRoutingComponents);
    runtime.stagePolicy(context.transactionId, candidateGeneration);
    return Promise.resolve({
      component: this.name,
      candidateGenerationId: context.candidateGenerationId,
      preparedAt: Date.now(),
      value: {
        oldGeneration,
        candidateGeneration,
        transactionId: context.transactionId,
        committed: false
      },
      resources: [],
      rollbackFailureStrategy: "keep-old-generation"
    });
  }

  public healthCheck(prepared: PreparedComponent<PolicyRuntimePrepared>): Promise<void> {
    for (const policy of prepared.value.candidateGeneration.policies) {
      const selection = prepared.value.candidateGeneration.selectForHealthCheck(policy.tag);
      if (selection.candidates.length === 0) {
        return Promise.reject(new Error(`policy candidate "${policy.tag}" has no selectable outbound`));
      }
      if (policy.type === "failover" && selection.candidates.length < 2) {
        return Promise.reject(new Error(`failover policy candidate "${policy.tag}" has no fallback`));
      }
    }
    return Promise.resolve();
  }

  public commit(prepared: PreparedComponent<PolicyRuntimePrepared>): Promise<void> {
    this.host.routingRuntime().commit(prepared.value.transactionId, "policy");
    prepared.value.committed = true;
    return Promise.resolve();
  }

  public rollback(prepared: PreparedComponent<PolicyRuntimePrepared>): Promise<void> {
    this.host.routingRuntime().rollback(prepared.value.transactionId);
    prepared.value.committed = false;
    return Promise.resolve();
  }

  public cleanup(prepared: PreparedComponent<PolicyRuntimePrepared>): Promise<void> {
    this.host.routingRuntime().cleanup(prepared.value.transactionId);
    return Promise.resolve();
  }
}
