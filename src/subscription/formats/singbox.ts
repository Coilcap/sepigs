import type { OutboundConfig } from "../../config/types.js";
import type { FormatResult } from "./clash.js";

export const parseSingBox = (root: Record<string, unknown>): FormatResult | undefined => {
  if (!Array.isArray(root.outbounds)) return undefined;
  const outbounds: OutboundConfig[] = [];
  const warnings: string[] = [];
  root.outbounds.forEach((value, index) => {
    if (!isRecord(value) || typeof value.type !== "string") {
      warnings.push(`outbounds[${index}] is invalid`);
      return;
    }
    const tag = typeof value.tag === "string" ? value.tag : `outbound-${index + 1}`;
    if (value.type === "direct" || value.type === "block") {
      outbounds.push({ type: value.type, tag });
      return;
    }
    if (value.type === "shadowsocks" && typeof value.server === "string" && typeof value.server_port === "number" && typeof value.method === "string" && typeof value.password === "string") {
      if (!isCipher(value.method)) { warnings.push(`outbounds[${index}] Shadowsocks method "${value.method}" is unsupported`); return; }
      outbounds.push({ type: "shadowsocks", tag, serverHost: value.server, serverPort: value.server_port, method: value.method, password: value.password });
      return;
    }
    if (value.type === "trojan" && typeof value.server === "string" && typeof value.server_port === "number" && typeof value.password === "string") {
      const tls = isRecord(value.tls) ? value.tls : {};
      outbounds.push({ type: "trojan", tag, serverHost: value.server, serverPort: value.server_port, password: value.password, tls: { enabled: tls.enabled !== false, rejectUnauthorized: tls.insecure !== true, ...(typeof tls.server_name === "string" ? { serverName: tls.server_name } : {}) } });
      return;
    }
    warnings.push(`outbounds[${index}] type "${value.type}" is unsupported`);
  });
  return { outbounds, warnings };
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const isCipher = (value: string): value is "aes-128-gcm" | "aes-256-gcm" | "chacha20-ietf-poly1305" => value === "aes-128-gcm" || value === "aes-256-gcm" || value === "chacha20-ietf-poly1305";
