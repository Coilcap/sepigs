import type { OutboundConfig } from "../config/types.js";

export const redactSubscriptionOutbounds = (outbounds: readonly OutboundConfig[]): readonly unknown[] => outbounds.map((outbound) => {
  const value = { ...outbound } as Record<string, unknown>;
  for (const key of ["password", "privateKey", "publicKey", "token"]) {
    if (key in value) value[key] = "[REDACTED]";
  }
  if (typeof value.peer === "object" && value.peer !== null) {
    value.peer = { ...(value.peer as Record<string, unknown>), publicKey: "[REDACTED]" };
  }
  return value;
});
