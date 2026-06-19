import type { ProxyRequest } from "../../protocol/types.js";

export interface RpcRequestEnvelope {
  readonly rpcVersion: 1;
  readonly kind: "outbound.connect";
  readonly outboundType: string;
  readonly request: SerializedProxyRequest;
}

export interface SerializedProxyRequest {
  readonly id: string;
  readonly inboundTag: string;
  readonly protocol: string;
  readonly network: "tcp" | "udp";
  readonly destination: {
    readonly host: string;
    readonly port: number;
    readonly addressType: string;
  };
  readonly source?: {
    readonly host: string;
    readonly port: number;
  };
  readonly startedAt: number;
}

export type RemoteOutboundDecision =
  | { readonly action: "direct" }
  | { readonly action: "block"; readonly reason?: string };

export const serializeProxyRequest = (request: ProxyRequest): SerializedProxyRequest => {
  const serialized: SerializedProxyRequest = {
    id: request.id,
    inboundTag: request.inboundTag,
    protocol: request.protocol,
    network: request.network,
    destination: request.destination,
    startedAt: request.startedAt
  };
  if (request.source !== undefined) {
    return { ...serialized, source: request.source };
  }
  return serialized;
};

export const isRemoteOutboundDecision = (value: unknown): value is RemoteOutboundDecision => {
  if (typeof value !== "object" || value === null || Array.isArray(value) || !("action" in value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.action === "direct" ||
    (record.action === "block" && (record.reason === undefined || typeof record.reason === "string"))
  );
};
