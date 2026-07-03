import type { SepigsConfig } from "../../config/types.js";
import type { ProxyRequest } from "../../protocol/types.js";
import {
  RoutingGenerationRuntime,
  type RoutingComponent
} from "../../router/generation.js";
import { RouterGeneration } from "../../router/routerGeneration.js";
import { makeDestination } from "../../utils/net.js";
import type {
  PreparedComponent,
  ReloadableComponent,
  ReloadOperationContext
} from "../contract.js";

export interface RouterPolicyRuntimeHost {
  routingRuntime(): RoutingGenerationRuntime;
  outboundTags(): ReadonlySet<string>;
}

interface RouterRuntimePrepared {
  readonly oldGeneration: RouterGeneration;
  readonly candidateGeneration: RouterGeneration;
  readonly transactionId: string;
  committed: boolean;
}

export class RouterRuntimeAdapter implements ReloadableComponent<RouterRuntimePrepared> {
  public readonly name = "router" as const;

  public constructor(
    private readonly host: RouterPolicyRuntimeHost,
    private readonly expectedRoutingComponents: readonly RoutingComponent[]
  ) {}

  public currentGeneration(): string {
    return this.host.routingRuntime().active().router.id;
  }

  public prepare(
    config: SepigsConfig,
    context: ReloadOperationContext
  ): Promise<PreparedComponent<RouterRuntimePrepared>> {
    const runtime = this.host.routingRuntime();
    const oldGeneration = runtime.active().router;
    const candidateGeneration = new RouterGeneration({
      id: `${context.candidateGenerationId}-router`,
      sequence: oldGeneration.sequence + 1,
      config: config.route,
      allowedTargets: new Set([
        ...this.host.outboundTags(),
        ...config.route.policies.map((policy) => policy.tag)
      ])
    });
    runtime.begin(context.transactionId, this.expectedRoutingComponents);
    runtime.stageRouter(context.transactionId, candidateGeneration);
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

  public healthCheck(prepared: PreparedComponent<RouterRuntimePrepared>): Promise<void> {
    const samples = [
      sampleRequest("example.test", 443),
      sampleRequest("198.51.100.10", 80),
      sampleRequest("203.0.113.20", 53)
    ];
    for (const sample of samples) {
      const first = prepared.value.candidateGeneration.match(sample);
      const second = prepared.value.candidateGeneration.match(sample);
      if (JSON.stringify(first) !== JSON.stringify(second)) {
        return Promise.reject(new Error("router candidate produced a non-deterministic match"));
      }
    }
    return Promise.resolve();
  }

  public commit(prepared: PreparedComponent<RouterRuntimePrepared>): Promise<void> {
    this.host.routingRuntime().commit(prepared.value.transactionId, "router");
    prepared.value.committed = true;
    return Promise.resolve();
  }

  public rollback(prepared: PreparedComponent<RouterRuntimePrepared>): Promise<void> {
    this.host.routingRuntime().rollback(prepared.value.transactionId);
    prepared.value.committed = false;
    return Promise.resolve();
  }

  public cleanup(prepared: PreparedComponent<RouterRuntimePrepared>): Promise<void> {
    this.host.routingRuntime().cleanup(prepared.value.transactionId);
    return Promise.resolve();
  }
}

const sampleRequest = (host: string, port: number): ProxyRequest => ({
  id: "router-runtime-health",
  inboundTag: "reload-health",
  protocol: "http",
  network: "tcp",
  destination: makeDestination(host, port),
  startedAt: 0
});
