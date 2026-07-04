import type {
  OutboundConfig,
  SepigsConfig
} from "../../config/types.js";
import { buildOutboundGeneration } from "../../outbound/generationBuilder.js";
import type { Outbound } from "../../outbound/outbound.js";
import type { OutboundRuntimeRegistry } from "../../outbound/runtimeRegistry.js";
import type { OutboundValidationIssue } from "../../outbound/generationTypes.js";
import type { RoutingGenerationRuntime, RoutingComponent } from "../../router/generation.js";
import type { OutboundHealthSnapshot } from "../../router/policy.js";
import { ConfigError } from "../../utils/errors.js";
import type {
  PreparedComponent,
  ReloadableComponent,
  ReloadOperationContext
} from "../contract.js";

const ALLOWED_TYPES = new Set<OutboundConfig["type"]>([
  "direct",
  "block",
  "tcpRelay"
]);

export interface OutboundRuntimeHost {
  outboundRuntimeRegistry(): OutboundRuntimeRegistry;
  currentOutboundConfigs(): readonly OutboundConfig[];
  currentOutboundHealthSnapshot(): readonly OutboundHealthSnapshot[];
  createRuntimeOutbound(config: OutboundConfig, candidate: SepigsConfig): Outbound;
  routingRuntime(): RoutingGenerationRuntime;
}

export interface OutboundRuntimePrepared {
  readonly oldGenerationId: string;
  readonly candidateGeneration: ReturnType<
    typeof buildOutboundGeneration
  >["generation"];
  readonly candidateOutbounds: ReadonlyMap<string, Outbound>;
  readonly transactionId: string;
  readonly participatesInRoutingTransaction: boolean;
  readonly validationWarnings: readonly OutboundValidationIssue[];
  switched: boolean;
  committed: boolean;
  disposed: boolean;
}

export class OutboundRuntimeAdapter
implements ReloadableComponent<OutboundRuntimePrepared> {
  public readonly name = "outbound-registry" as const;

  public constructor(
    private readonly host: OutboundRuntimeHost,
    private readonly expectedRoutingComponents: readonly RoutingComponent[]
  ) {}

  public currentGeneration(): string {
    return this.host.outboundRuntimeRegistry().getActiveGeneration().id;
  }

  public async prepare(
    config: SepigsConfig,
    context: ReloadOperationContext
  ): Promise<PreparedComponent<OutboundRuntimePrepared>> {
    const registry = this.host.outboundRuntimeRegistry();
    const oldGeneration = registry.getActiveGeneration();
    const built = buildOutboundGeneration({
      id: `${context.candidateGenerationId}-outbound`,
      currentOutbounds: this.host.currentOutboundConfigs(),
      candidateConfig: config,
      currentPolicies: oldGeneration.policyBindingSnapshot.policies,
      healthSnapshot: this.host.currentOutboundHealthSnapshot(),
      activeReferenceTags: registry.activeReferenceTags(),
      parentGenerationId: oldGeneration.id
    });
    const unsupported = [...built.generation.registrySnapshot.values()].filter(
      (entry) => !ALLOWED_TYPES.has(entry.type)
    );
    if (unsupported.length > 0) {
      registry.recordRejectedUnsupported();
      throw new ConfigError(
        `M11 outbound transactional reload rejects unsupported type(s): ${unsupported.map((entry) => entry.type).join(", ")}`
      );
    }
    if (built.validation.errors.length > 0) {
      throw new ConfigError(
        `M11 outbound candidate validation failed: ${built.validation.errors.map((issue) => issue.message).join("; ")}`
      );
    }
    if (
      built.validation.unsupportedChanges.length > 0 ||
      built.validation.riskSummary.highest !== "low"
    ) {
      registry.recordRejectedUnsupported();
      throw new ConfigError(
        "M11 outbound candidate contains unsupported or non-low-risk changes"
      );
    }

    const candidateOutbounds = new Map<string, Outbound>();
    try {
      for (const outboundConfig of config.outbounds) {
        const outbound = this.host.createRuntimeOutbound(outboundConfig, config);
        candidateOutbounds.set(outbound.tag, outbound);
      }
    } catch (error) {
      await stopOutbounds(candidateOutbounds);
      throw error;
    }
    const participatesInRoutingTransaction =
      this.expectedRoutingComponents.includes("outbound");
    return {
      component: this.name,
      candidateGenerationId: context.candidateGenerationId,
      preparedAt: Date.now(),
      value: {
        oldGenerationId: oldGeneration.id,
        candidateGeneration: built.generation,
        candidateOutbounds,
        transactionId: context.transactionId,
        participatesInRoutingTransaction,
        validationWarnings: built.validation.warnings,
        switched: false,
        committed: false,
        disposed: false
      },
      resources: [...candidateOutbounds.keys()].map((tag) => ({
        id: `${built.generation.id}:${tag}`,
        owner: this.name,
        kind: "other",
        state: "prepared"
      })),
      rollbackFailureStrategy: "keep-old-generation"
    };
  }

  public healthCheck(
    prepared: PreparedComponent<OutboundRuntimePrepared>
  ): Promise<void> {
    for (const entry of prepared.value.candidateGeneration.registrySnapshot.values()) {
      if (!ALLOWED_TYPES.has(entry.type) || entry.riskLevel !== "low") {
        return Promise.reject(
          new ConfigError(`M11 health check rejects outbound type "${entry.type}"`)
        );
      }
      const outbound = prepared.value.candidateOutbounds.get(entry.tag);
      if (outbound === undefined || outbound.type !== entry.type) {
        return Promise.reject(
          new ConfigError(`M11 candidate factory unavailable for "${entry.tag}"`)
        );
      }
    }
    return Promise.resolve();
  }

  public async commit(
    prepared: PreparedComponent<OutboundRuntimePrepared>
  ): Promise<void> {
    const registry = this.host.outboundRuntimeRegistry();
    registry.switchGeneration(
      prepared.value.candidateGeneration,
      prepared.value.candidateOutbounds
    );
    prepared.value.switched = true;
    try {
      if (prepared.value.participatesInRoutingTransaction) {
        this.host.routingRuntime().commit(
          prepared.value.transactionId,
          "outbound"
        );
      }
      prepared.value.committed = true;
    } catch (error) {
      registry.restoreGeneration(
        prepared.value.oldGenerationId,
        prepared.value.candidateGeneration.id
      );
      prepared.value.switched = false;
      await registry.retireIfUnused(prepared.value.candidateGeneration.id);
      prepared.value.disposed = true;
      throw error;
    }
  }

  public async rollback(
    prepared: PreparedComponent<OutboundRuntimePrepared>
  ): Promise<void> {
    if (prepared.value.switched) {
      this.host.outboundRuntimeRegistry().restoreGeneration(
        prepared.value.oldGenerationId,
        prepared.value.candidateGeneration.id
      );
      if (prepared.value.participatesInRoutingTransaction) {
        this.host.routingRuntime().rollback(prepared.value.transactionId);
      }
    }
    prepared.value.switched = false;
    prepared.value.committed = false;
    await Promise.resolve();
  }

  public async cleanup(
    prepared: PreparedComponent<OutboundRuntimePrepared>
  ): Promise<void> {
    const registry = this.host.outboundRuntimeRegistry();
    if (prepared.value.disposed) return;
    if (!prepared.value.switched && !registry.snapshot().generations.some(
      (generation) => generation.id === prepared.value.candidateGeneration.id
    )) {
      await stopOutbounds(prepared.value.candidateOutbounds);
      prepared.value.disposed = true;
      return;
    }
    if (prepared.value.committed) {
      await registry.retireIfUnused(prepared.value.oldGenerationId);
    } else {
      await registry.retireIfUnused(prepared.value.candidateGeneration.id);
      prepared.value.disposed = true;
    }
  }
}

const stopOutbounds = async (
  outbounds: ReadonlyMap<string, Outbound>
): Promise<void> => {
  await Promise.all(
    [...outbounds.values()].map(async (outbound) => {
      await outbound.stop();
    })
  );
};
