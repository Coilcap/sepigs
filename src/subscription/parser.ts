import YAML from "yaml";
import type { OutboundConfig, ShadowsocksCipher } from "../config/types.js";
import { ConfigError } from "../utils/errors.js";

export interface SubscriptionParseResult {
  readonly outbounds: readonly OutboundConfig[];
}

export const parseSubscription = (input: string): SubscriptionParseResult => {
  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return { outbounds: [] };
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[") || /^[a-zA-Z0-9_-]+:/u.test(trimmed.split("\n")[0] ?? "")) {
    const structured = tryParseStructuredSubscription(trimmed);
    if (structured !== undefined) {
      return structured;
    }
  }

  const outbounds = trimmed
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .map((line, index) => parseSubscriptionUrl(line, index));

  return { outbounds };
};

const tryParseStructuredSubscription = (input: string): SubscriptionParseResult | undefined => {
  try {
    const parsed = input.startsWith("{") || input.startsWith("[") ? (JSON.parse(input) as unknown) : (YAML.parse(input) as unknown);
    if (Array.isArray(parsed)) {
      return { outbounds: parsed.map((item, index) => parseStructuredOutbound(item, index)) };
    }
    if (isRecord(parsed) && Array.isArray(parsed.outbounds)) {
      return { outbounds: parsed.outbounds.map((item, index) => parseStructuredOutbound(item, index)) };
    }
  } catch {
    return undefined;
  }
  return undefined;
};

const parseStructuredOutbound = (input: unknown, index: number): OutboundConfig => {
  if (!isRecord(input) || typeof input.type !== "string" || typeof input.tag !== "string") {
    throw new ConfigError(`subscription outbounds[${index}] must contain type and tag`);
  }
  return input as unknown as OutboundConfig;
};

const parseSubscriptionUrl = (line: string, index: number): OutboundConfig => {
  if (line.startsWith("ss://")) {
    return parseShadowsocksUrl(line, index);
  }
  if (line.startsWith("trojan://")) {
    return parseTrojanUrl(line, index);
  }
  if (line.startsWith("wireguard://")) {
    return parseWireGuardUrl(line, index);
  }
  throw new ConfigError(`unsupported subscription URL at line ${index + 1}`);
};

const parseShadowsocksUrl = (line: string, index: number): OutboundConfig => {
  const body = line.slice("ss://".length);
  const hashIndex = body.indexOf("#");
  const withoutName = hashIndex >= 0 ? body.slice(0, hashIndex) : body;
  const tag = decodeURIComponent(hashIndex >= 0 ? body.slice(hashIndex + 1) : `ss-${index + 1}`);

  const decoded = withoutName.includes("@") ? withoutName : Buffer.from(withoutName, "base64url").toString("utf8");
  const at = decoded.lastIndexOf("@");
  if (at < 0) {
    throw new ConfigError(`invalid Shadowsocks URL at line ${index + 1}`);
  }
  const userInfo = decoded.slice(0, at);
  const endpoint = decoded.slice(at + 1);
  const colon = userInfo.indexOf(":");
  const portColon = endpoint.lastIndexOf(":");
  if (colon < 0 || portColon < 0) {
    throw new ConfigError(`invalid Shadowsocks URL at line ${index + 1}`);
  }

  return {
    type: "shadowsocks",
    tag,
    method: userInfo.slice(0, colon) as ShadowsocksCipher,
    password: userInfo.slice(colon + 1),
    serverHost: endpoint.slice(0, portColon),
    serverPort: readPort(endpoint.slice(portColon + 1), line)
  };
};

const parseTrojanUrl = (line: string, index: number): OutboundConfig => {
  const url = new URL(line);
  const serverName = url.searchParams.get("sni");
  return {
    type: "trojan",
    tag: decodeURIComponent(url.hash.length > 1 ? url.hash.slice(1) : `trojan-${index + 1}`),
    password: decodeURIComponent(url.username),
    serverHost: url.hostname,
    serverPort: readPort(url.port, line),
    tls: {
      enabled: url.searchParams.get("tls") !== "0",
      rejectUnauthorized: url.searchParams.get("allowInsecure") !== "1",
      ...(serverName === null ? {} : { serverName })
    }
  };
};

const parseWireGuardUrl = (line: string, index: number): OutboundConfig => {
  const url = new URL(line);
  const allowedIps = url.searchParams.get("allowedIps")?.split(",").filter((item) => item.length > 0) ?? ["0.0.0.0/0"];
  return {
    type: "wireguard",
    tag: decodeURIComponent(url.hash.length > 1 ? url.hash.slice(1) : `wireguard-${index + 1}`),
    privateKey: decodeURIComponent(url.username),
    address: url.searchParams.get("address")?.split(",").filter((item) => item.length > 0) ?? [],
    peer: {
      publicKey: decodeURIComponent(url.password),
      endpointHost: url.hostname,
      endpointPort: readPort(url.port, line),
      allowedIps
    }
  };
};

const readPort = (raw: string, source: string): number => {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new ConfigError(`invalid port in subscription URL "${source}"`);
  }
  return port;
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};
