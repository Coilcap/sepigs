import type { SepigsConfig } from "../config/types.js";
import type { ReloadComponentName, ReloadResourceDescriptor } from "./types.js";

export type ReloadRollbackFailureStrategy =
  | "keep-old-generation"
  | "keep-new-generation-and-alert"
  | "require-process-restart";

export interface ReloadOperationContext {
  readonly transactionId: string;
  readonly oldGenerationId: string;
  readonly candidateGenerationId: string;
  readonly deadline: number;
  readonly signal: AbortSignal;
}

export interface PreparedComponent<Value = unknown> {
  readonly component: ReloadComponentName;
  readonly candidateGenerationId: string;
  readonly preparedAt: number;
  readonly value: Value;
  readonly resources: readonly ReloadResourceDescriptor[];
  readonly rollbackFailureStrategy: ReloadRollbackFailureStrategy;
}

export interface ReloadableComponent<PreparedValue = unknown> {
  readonly name: ReloadComponentName;
  currentGeneration(): string;
  prepare(config: SepigsConfig, context: ReloadOperationContext): Promise<PreparedComponent<PreparedValue>>;
  healthCheck(prepared: PreparedComponent<PreparedValue>, context: ReloadOperationContext): Promise<void>;
  commit(prepared: PreparedComponent<PreparedValue>, context: ReloadOperationContext): Promise<void>;
  rollback(prepared: PreparedComponent<PreparedValue>, context: ReloadOperationContext): Promise<void>;
  cleanup(prepared: PreparedComponent<PreparedValue>, context: ReloadOperationContext): Promise<void>;
}

export const executeReloadOperation = async <Result>(
  label: string,
  context: ReloadOperationContext,
  operation: (signal: AbortSignal) => Promise<Result>
): Promise<Result> => {
  if (context.signal.aborted) throw new Error(`reload operation "${label}" aborted before start`);
  const remainingMs = context.deadline - Date.now();
  if (remainingMs <= 0) throw new Error(`reload operation "${label}" exceeded transaction deadline`);

  const operationController = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      operation(operationController.signal),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => {
          operationController.abort();
          reject(new Error(`reload operation "${label}" timed out after ${String(remainingMs)}ms`));
        }, remainingMs);
        onAbort = () => {
          operationController.abort();
          reject(new Error(`reload operation "${label}" aborted`));
        };
        context.signal.addEventListener("abort", onAbort, { once: true });
      })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
    if (onAbort !== undefined) context.signal.removeEventListener("abort", onAbort);
  }
};
