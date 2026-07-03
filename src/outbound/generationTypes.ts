import type {
  OutboundConfig,
  RoutingPolicyConfig
} from "../config/types.js";
import type { OutboundHealthSnapshot } from "../router/policy.js";

export type OutboundGenerationState =
  | "active"
  | "candidate"
  | "draining"
  | "retired";

export type OutboundRiskLevel = "low" | "medium" | "high";

export interface OutboundCapabilities {
  readonly tcp: boolean;
  readonly udp: boolean;
  readonly stateless: boolean;
}

export interface OutboundGenerationEntry {
  readonly tag: string;
  readonly type: OutboundConfig["type"];
  readonly configHash: string;
  readonly configSnapshot: Readonly<Record<string, unknown>>;
  readonly capabilities: Readonly<OutboundCapabilities>;
  readonly riskLevel: OutboundRiskLevel;
  readonly experimental: boolean;
  readonly dependencies: readonly string[];
}

export interface OutboundPolicyBindingSnapshot {
  readonly defaultOutbound: string;
  readonly policies: readonly RoutingPolicyConfig[];
}

export interface OutboundGenerationDescriptor {
  readonly id: string;
  readonly configHash: string;
  readonly createdAt: number;
  readonly registrySnapshot: ReadonlyMap<string, OutboundGenerationEntry>;
  readonly outboundTags: readonly string[];
  readonly outboundTypes: Readonly<Record<string, OutboundConfig["type"]>>;
  readonly policyBindingSnapshot: Readonly<OutboundPolicyBindingSnapshot>;
  readonly healthSnapshot: readonly OutboundHealthSnapshot[];
  readonly readonly: true;
  readonly state: OutboundGenerationState;
  readonly referenceCount: number;
  readonly parentGenerationId: string | undefined;
  acquire(): () => void;
}

export interface OutboundRename {
  readonly from: string;
  readonly to: string;
  readonly type: OutboundConfig["type"];
}

export interface OutboundModifiedEntry {
  readonly tag: string;
  readonly changedFields: readonly string[];
}

export interface OutboundGenerationDiff {
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly modified: readonly OutboundModifiedEntry[];
  readonly renamed: readonly OutboundRename[];
  readonly typeChanged: readonly string[];
  readonly targetChanged: readonly string[];
  readonly secretChanged: readonly string[];
  readonly policyReferencedTags: Readonly<Record<string, readonly string[]>>;
  readonly missingPolicyReferences: readonly string[];
}

export interface OutboundValidationIssue {
  readonly code: string;
  readonly message: string;
  readonly tag?: string;
}

export interface OutboundRiskSummary {
  readonly low: number;
  readonly medium: number;
  readonly high: number;
  readonly highest: OutboundRiskLevel | "none";
}

export interface OutboundValidationResult {
  readonly errors: readonly OutboundValidationIssue[];
  readonly warnings: readonly OutboundValidationIssue[];
  readonly riskSummary: OutboundRiskSummary;
  readonly requiresRuntimeRestart: boolean;
  readonly unsupportedChanges: readonly string[];
}

export interface OutboundGenerationBuildResult {
  readonly generation: OutboundGenerationDescriptor;
  readonly diff: OutboundGenerationDiff;
  readonly validation: OutboundValidationResult;
}
