import { createHash } from "node:crypto";
import { parentPort } from "node:worker_threads";
import type { JsonValue, WorkerTask, WorkerTaskResult } from "./workerPool.js";

interface WorkerRequest {
  readonly id: number;
  readonly task: WorkerTask;
}

interface WorkerResponse {
  readonly id: number;
  readonly ok: boolean;
  readonly result?: WorkerTaskResult;
  readonly error?: string;
}

const isJsonValue = (value: unknown): value is JsonValue => {
  if (value === null) {
    return true;
  }
  const valueType = typeof value;
  if (valueType === "string" || valueType === "number" || valueType === "boolean") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.every((item) => isJsonValue(item));
  }
  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).every((item) => isJsonValue(item));
  }
  return false;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isWorkerRequest = (value: unknown): value is WorkerRequest => {
  if (!isRecord(value) || typeof value.id !== "number" || !isRecord(value.task)) {
    return false;
  }
  const task = value.task;
  if (task.kind === "echo") {
    return isJsonValue(task.value);
  }
  return task.kind === "sha256" && typeof task.value === "string";
};

const runTask = (task: WorkerTask): WorkerTaskResult => {
  if (task.kind === "echo") {
    return { kind: "echo", value: task.value };
  }
  return {
    kind: "sha256",
    value: createHash("sha256").update(task.value).digest("hex")
  };
};

const send = (response: WorkerResponse): void => {
  parentPort?.postMessage(response);
};

parentPort?.on("message", (message: unknown) => {
  if (!isWorkerRequest(message)) {
    send({ id: -1, ok: false, error: "invalid worker request" });
    return;
  }
  try {
    send({ id: message.id, ok: true, result: runTask(message.task) });
  } catch (error) {
    send({ id: message.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
});
