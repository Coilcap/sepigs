import type { OutboundConfig, ShadowsocksCipher } from "../../config/types.js";
import { ConfigError } from "../../utils/errors.js";

export interface FormatResult { readonly outbounds: readonly OutboundConfig[]; readonly warnings: readonly string[] }

export const parseClash = (root: Record<string, unknown>): FormatResult | undefined => {
  if (!Array.isArray(root.proxies)) {
    return undefined;
  }
  const warnings: string[] = [];
  const outbounds: OutboundConfig[] = [];
  root.proxies.forEach((value, index) => {
    if (!isRecord(value)) {
      warnings.push(`proxies[${index}] is not an object`);
      return;
    }
    const type = string(value.type)?.toLowerCase();
    try {
      if (type === "ss") {
        const method = required(value, "cipher", index);
        if (!isCipher(method)) throw new ConfigError(`proxies[${index}].cipher is unsupported`);
        outbounds.push({ type: "shadowsocks", tag: required(value, "name", index), serverHost: required(value, "server", index), serverPort: port(value.port, index), method, password: required(value, "password", index) });
      } else if (type === "trojan") {
        outbounds.push({ type: "trojan", tag: required(value, "name", index), serverHost: required(value, "server", index), serverPort: port(value.port, index), password: required(value, "password", index), tls: { enabled: true, rejectUnauthorized: value["skip-cert-verify"] !== true, ...(typeof value.sni === "string" ? { serverName: value.sni } : {}) } });
      } else {
        warnings.push(`proxies[${index}] type "${type ?? "unknown"}" is unsupported`);
      }
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : String(error));
    }
  });
  return { outbounds, warnings };
};

const required = (record: Record<string, unknown>, key: string, index: number): string => {
  const value = string(record[key]);
  if (value === undefined) throw new ConfigError(`proxies[${index}].${key} is required`);
  return value;
};
const port = (value: unknown, index: number): number => {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 65_535) throw new ConfigError(`proxies[${index}].port is invalid`);
  return value;
};
const string = (value: unknown): string | undefined => typeof value === "string" && value.length > 0 ? value : undefined;
const isCipher = (value: string): value is ShadowsocksCipher => value === "aes-128-gcm" || value === "aes-256-gcm" || value === "chacha20-ietf-poly1305";
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
