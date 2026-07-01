export const RELOAD_TRANSACTION_STATES = [
  "idle",
  "parsing",
  "validating",
  "preparing",
  "prepared",
  "committing",
  "committed",
  "rolling-back",
  "rolled-back",
  "failed"
] as const;

export type ReloadTransactionState = typeof RELOAD_TRANSACTION_STATES[number];

export type ReloadGenerationState =
  | "candidate"
  | "prepared"
  | "active"
  | "draining"
  | "retired"
  | "failed";

export type ReloadComponentName =
  | "dns"
  | "fake-ip-store"
  | "router"
  | "policy-prober"
  | "outbound-registry"
  | "inbound-listeners"
  | "dashboard-server"
  | "metrics-server"
  | "plugin-manager"
  | "connection-manager"
  | "udp-session-manager";

export interface ReloadComponentDescriptor {
  readonly name: ReloadComponentName;
  readonly generationId: string;
  readonly state: "reused" | "candidate" | "prepared" | "active" | "draining" | "retired" | "failed";
  readonly configHash: string;
}

export interface ReloadResourceDescriptor {
  readonly id: string;
  readonly owner: ReloadComponentName;
  readonly kind: "listener" | "socket" | "timer" | "worker" | "plugin-registration" | "cache" | "store" | "other";
  readonly state: "planned" | "prepared" | "active" | "draining" | "released" | "failed";
}

export interface ReloadGeneration {
  readonly id: string;
  readonly createdAt: number;
  readonly configHash: string;
  readonly state: ReloadGenerationState;
  readonly components: readonly ReloadComponentDescriptor[];
  readonly resources: readonly ReloadResourceDescriptor[];
  readonly parentGenerationId?: string;
}

export interface ReloadTransaction {
  readonly id: string;
  readonly oldGeneration: ReloadGeneration;
  readonly candidateGeneration: ReloadGeneration;
  readonly state: ReloadTransactionState;
  readonly startedAt: number;
  readonly completedAt?: number;
  readonly failureReason?: string;
}
