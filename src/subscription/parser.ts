import YAML from "yaml";
import type { OutboundConfig } from "../config/types.js";
import { ConfigError } from "../utils/errors.js";
import { parseClash, type FormatResult } from "./formats/clash.js";
import { parseShadowsocksUri } from "./formats/shadowsocksUri.js";
import { parseSingBox } from "./formats/singbox.js";
import { parseTrojanUri } from "./formats/trojanUri.js";
import { parseXray } from "./formats/xray.js";
import { normalizeOutbounds } from "./normalize.js";

export interface SubscriptionParseResult {
  readonly outbounds: readonly OutboundConfig[];
  readonly warnings: readonly string[];
  readonly format: "uri" | "clash" | "sing-box" | "xray" | "sepigs";
}

export const parseSubscription = (input: string): SubscriptionParseResult => {
  const trimmed = input.trim();
  if (trimmed.length === 0) return { outbounds: [], warnings: [], format: "uri" };
  const structured = parseStructured(trimmed);
  if (structured !== undefined) return { ...structured, outbounds: normalizeOutbounds(structured.outbounds) };
  const outbounds = trimmed.split(/\r?\n/u).map((line) => line.trim()).filter((line) => line.length > 0 && !line.startsWith("#")).map(parseUri);
  return { outbounds: normalizeOutbounds(outbounds), warnings: [], format: "uri" };
};

const parseStructured = (input: string): (FormatResult & { readonly format: SubscriptionParseResult["format"] }) | undefined => {
  let value: unknown;
  try { value = input.startsWith("{") || input.startsWith("[") ? JSON.parse(input) as unknown : YAML.parse(input) as unknown; } catch { return undefined; }
  if (Array.isArray(value)) return { outbounds: value.map((item, index) => parseSepigsOutbound(item, index)), warnings: [], format: "sepigs" };
  if (!isRecord(value)) return undefined;
  const clash = parseClash(value); if (clash !== undefined) return { ...clash, format: "clash" };
  const xray = parseXray(value); if (xray !== undefined) return { ...xray, format: "xray" };
  const singbox = parseSingBox(value); if (singbox !== undefined) return { ...singbox, format: "sing-box" };
  return undefined;
};

const parseUri = (line: string, index: number): OutboundConfig => {
  if (line.startsWith("ss://")) return parseShadowsocksUri(line, index);
  if (line.startsWith("trojan://")) return parseTrojanUri(line, index);
  if (line.startsWith("wireguard://")) {
    const url = new URL(line);
    const port = Number(url.port);
    if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new ConfigError(`invalid WireGuard port at line ${index + 1}`);
    return { type: "wireguard", tag: decodeURIComponent(url.hash.length > 1 ? url.hash.slice(1) : `wireguard-${index + 1}`), privateKey: decodeURIComponent(url.username), address: url.searchParams.get("address")?.split(",").filter(Boolean) ?? [], peer: { publicKey: decodeURIComponent(url.password), endpointHost: url.hostname, endpointPort: port, allowedIps: url.searchParams.get("allowedIps")?.split(",").filter(Boolean) ?? ["0.0.0.0/0"] } };
  }
  throw new ConfigError(`unsupported subscription URL at line ${index + 1}`);
};
const parseSepigsOutbound = (value: unknown, index: number): OutboundConfig => {
  if (!isRecord(value) || typeof value.type !== "string" || typeof value.tag !== "string") throw new ConfigError(`subscription outbounds[${index}] must contain type and tag`);
  return value as unknown as OutboundConfig;
};
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
