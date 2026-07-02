import type { ReloadComponentName } from "./types.js";

export const RELOAD_EVENT_TYPES = [
  "transaction.started",
  "transaction.phase.started",
  "transaction.phase.completed",
  "component.prepare.started",
  "component.prepare.completed",
  "component.prepare.failed",
  "component.health.failed",
  "component.commit.started",
  "component.commit.completed",
  "component.commit.failed",
  "component.rollback.started",
  "component.rollback.completed",
  "component.rollback.failed",
  "transaction.committed",
  "transaction.rolled_back",
  "transaction.failed",
  "transaction.cleaned_up"
] as const;

export type ReloadEventType = typeof RELOAD_EVENT_TYPES[number];

export type ReloadPhase =
  | "parse"
  | "validate"
  | "prepare"
  | "health"
  | "commit"
  | "rollback"
  | "cleanup";

export interface ReloadEvent {
  readonly type: ReloadEventType;
  readonly timestamp: string;
  readonly transactionId: string;
  readonly generationId: string;
  readonly component?: ReloadComponentName;
  readonly phase?: ReloadPhase;
  readonly durationMs?: number;
  readonly message?: string;
}

export interface ReloadEventInput {
  readonly type: ReloadEventType;
  readonly transactionId: string;
  readonly generationId: string;
  readonly component?: ReloadComponentName;
  readonly phase?: ReloadPhase;
  readonly durationMs?: number;
  readonly message?: string;
}

export class ReloadEventLog {
  private readonly events: ReloadEvent[] = [];

  public append(input: ReloadEventInput, now = Date.now()): ReloadEvent {
    const event: ReloadEvent = {
      type: input.type,
      timestamp: new Date(now).toISOString(),
      transactionId: input.transactionId,
      generationId: input.generationId,
      ...(input.component === undefined ? {} : { component: input.component }),
      ...(input.phase === undefined ? {} : { phase: input.phase }),
      ...(input.durationMs === undefined ? {} : { durationMs: Math.max(0, input.durationMs) }),
      ...(input.message === undefined ? {} : { message: sanitizeReloadMessage(input.message) })
    };
    this.events.push(event);
    return event;
  }

  public snapshot(): readonly ReloadEvent[] {
    return this.events.map((event) => ({ ...event }));
  }
}

export const sanitizeReloadMessage = (message: string): string => {
  const bounded = message.replaceAll(/\s+/gu, " ").trim().slice(0, 512);
  return bounded
    .replaceAll(/(password|token|secret|authorization)\s*[:=]\s*[^\s,;]+/giu, "$1=<redacted>")
    .replaceAll(/:\/\/([^/\s:@]+):([^@\s/]+)@/gu, "://<redacted>:<redacted>@");
};
