import type { OutboundConfig } from "../config/types.js";

export const normalizeOutbounds = (values: readonly OutboundConfig[]): readonly OutboundConfig[] => {
  const fingerprints = new Set<string>();
  const tags = new Map<string, number>();
  const output: OutboundConfig[] = [];
  for (const value of values) {
    const fingerprint = JSON.stringify({ ...value, tag: undefined });
    if (fingerprints.has(fingerprint)) continue;
    fingerprints.add(fingerprint);
    const base = sanitizeTag(value.tag);
    const count = (tags.get(base) ?? 0) + 1;
    tags.set(base, count);
    output.push({ ...value, tag: count === 1 ? base : `${base}-${count}` });
  }
  return output;
};

const sanitizeTag = (value: string): string => value.trim().replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "outbound";
