import type { OutboundConfig } from "../../config/types.js";
import type { FormatResult } from "./clash.js";

export const parseXray = (root: Record<string, unknown>): FormatResult | undefined => {
  if (!Array.isArray(root.outbounds) || !root.outbounds.some((item) => isRecord(item) && typeof item.protocol === "string")) return undefined;
  const outbounds: OutboundConfig[] = [];
  const warnings: string[] = [];
  root.outbounds.forEach((value, index) => {
    if (!isRecord(value) || typeof value.protocol !== "string") return;
    const tag = typeof value.tag === "string" ? value.tag : `xray-${index + 1}`;
    if (value.protocol === "freedom") outbounds.push({ type: "direct", tag });
    else if (value.protocol === "blackhole") outbounds.push({ type: "block", tag });
    else warnings.push(`outbounds[${index}] protocol "${value.protocol}" requires unsupported Xray-specific fields`);
  });
  return { outbounds, warnings };
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
