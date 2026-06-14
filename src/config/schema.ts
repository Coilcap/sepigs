import type {
  BlockOutboundConfig,
  ConnectionPoolConfig,
  DnsConfig,
  DirectOutboundConfig,
  ExtensionType,
  GeoConfig,
  HotReloadConfig,
  HttpInboundConfig,
  InboundConfig,
  LimitConfig,
  LoadBalanceStrategy,
  LogConfig,
  LogLevel,
  OutboundConfig,
  PluginConfig,
  PluginInboundConfig,
  PluginModuleConfig,
  PluginOutboundConfig,
  RouteRuleConfig,
  RouteRuleSetFileConfig,
  RoutingPolicyConfig,
  RoutingPolicyType,
  RouterConfig,
  SepigsConfig,
  ShadowsocksOutboundConfig,
  Socks5InboundConfig,
  TcpRelayOutboundConfig,
  TransportConfig,
  TrojanOutboundConfig,
  WasmExtensionConfig,
  WorkerConfig,
  WireGuardOutboundConfig
} from "./types.js";
import { isValidCidr } from "../router/matcher.js";
import { ConfigError } from "../utils/errors.js";

const DEFAULT_LOG: LogConfig = {
  level: "info"
};

const DEFAULT_LIMITS: LimitConfig = {
  connectTimeoutMs: 10_000,
  handshakeTimeoutMs: 10_000,
  idleTimeoutMs: 120_000,
  shutdownTimeoutMs: 5_000,
  maxHeaderBytes: 64 * 1024,
  maxConnections: 10_000,
  leakReportIntervalMs: 60_000
};

const DEFAULT_DNS: DnsConfig = {
  strategy: "system",
  cacheTtlMs: 60_000,
  hosts: {}
};

const DEFAULT_GEO: GeoConfig = {
  geoip: {},
  geosite: {}
};

const DEFAULT_PLUGINS: PluginConfig = {
  modules: [],
  wasm: []
};

const DEFAULT_WORKERS: WorkerConfig = {
  enabled: false,
  size: 1,
  taskTimeoutMs: 30_000
};

const DEFAULT_TRANSPORT: TransportConfig = {
  quic: {
    enabled: false,
    handshakeTimeoutMs: 10_000
  }
};

const DEFAULT_CONNECTION_POOL: ConnectionPoolConfig = {
  enabled: false,
  maxIdlePerEndpoint: 8,
  idleTimeoutMs: 30_000
};

const DEFAULT_HOT_RELOAD: HotReloadConfig = {
  enabled: false,
  debounceMs: 250
};

const LOG_LEVELS = new Set<LogLevel>(["debug", "info", "warn", "error", "silent"]);
const DNS_STRATEGIES = new Set<DnsConfig["strategy"]>(["system", "prefer-ipv4", "prefer-ipv6"]);
const SHADOWSOCKS_METHODS = new Set<ShadowsocksOutboundConfig["method"]>([
  "aes-128-gcm",
  "aes-256-gcm",
  "chacha20-ietf-poly1305"
]);
const ROUTING_POLICY_TYPES = new Set<RoutingPolicyType>(["loadBalance", "failover"]);
const LOAD_BALANCE_STRATEGIES = new Set<LoadBalanceStrategy>(["roundRobin", "leastLatency", "random"]);

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const isExtensionType = (value: string): value is ExtensionType => {
  return value.startsWith("plugin.") && value.length > "plugin.".length;
};

const readString = (record: Record<string, unknown>, key: string, path: string, errors: string[]): string | undefined => {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path}.${key} must be a non-empty string`);
    return undefined;
  }
  return value;
};

const readOptionalString = (record: Record<string, unknown>, key: string, path: string, errors: string[]): string | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${path}.${key} must be a non-empty string when provided`);
    return undefined;
  }
  return value;
};

const readNumber = (
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  min: number,
  max: number
): number | undefined => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`${path}.${key} must be an integer between ${min} and ${max}`);
    return undefined;
  }
  return value;
};

const readOptionalNumber = (
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[],
  min: number,
  max: number
): number | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    errors.push(`${path}.${key} must be an integer between ${min} and ${max} when provided`);
    return undefined;
  }
  return value;
};

const readStringArray = (record: Record<string, unknown>, key: string, path: string, errors: string[]): readonly string[] | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push(`${path}.${key} must be an array of non-empty strings`);
    return undefined;
  }

  const output: string[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "string" || item.trim().length === 0) {
      errors.push(`${path}.${key}[${index}] must be a non-empty string`);
      return;
    }
    output.push(item.trim());
  });
  return output;
};

const readOptionalBoolean = (record: Record<string, unknown>, key: string, path: string, errors: string[]): boolean | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "boolean") {
    errors.push(`${path}.${key} must be a boolean when provided`);
    return undefined;
  }
  return value;
};

const readStringRecord = (
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): Readonly<Record<string, string>> | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    errors.push(`${path}.${key} must be an object of string values`);
    return undefined;
  }

  const output: Record<string, string> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (typeof entryValue !== "string" || entryValue.trim().length === 0) {
      errors.push(`${path}.${key}.${entryKey} must be a non-empty string`);
      continue;
    }
    output[entryKey.toLowerCase()] = entryValue.trim();
  }
  return output;
};

const readStringArrayRecord = (
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): Readonly<Record<string, readonly string[]>> | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    errors.push(`${path}.${key} must be an object of string arrays`);
    return undefined;
  }

  const output: Record<string, readonly string[]> = {};
  for (const [entryKey, entryValue] of Object.entries(value)) {
    if (!Array.isArray(entryValue)) {
      errors.push(`${path}.${key}.${entryKey} must be an array of strings`);
      continue;
    }
    const items: string[] = [];
    entryValue.forEach((item, index) => {
      if (typeof item !== "string" || item.trim().length === 0) {
        errors.push(`${path}.${key}.${entryKey}[${index}] must be a non-empty string`);
        return;
      }
      items.push(item.trim());
    });
    output[entryKey.toLowerCase()] = items;
  }
  return output;
};

const readOptionsRecord = (
  record: Record<string, unknown>,
  key: string,
  path: string,
  errors: string[]
): Readonly<Record<string, unknown>> => {
  const value = record[key];
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    errors.push(`${path}.${key} must be an object when provided`);
    return {};
  }
  return value;
};

const readPortArray = (record: Record<string, unknown>, key: string, path: string, errors: string[]): readonly number[] | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }

  const values = Array.isArray(value) ? value : [value];
  const output: number[] = [];
  values.forEach((item, index) => {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 1 || item > 65_535) {
      errors.push(`${path}.${key}[${index}] must be an integer between 1 and 65535`);
      return;
    }
    output.push(item);
  });
  return output;
};

const readByteArray = (record: Record<string, unknown>, key: string, path: string, errors: string[]): readonly number[] | undefined => {
  const value = record[key];
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    errors.push(`${path}.${key} must be an array of bytes`);
    return undefined;
  }
  const output: number[] = [];
  value.forEach((item, index) => {
    if (typeof item !== "number" || !Number.isInteger(item) || item < 0 || item > 255) {
      errors.push(`${path}.${key}[${index}] must be an integer between 0 and 255`);
      return;
    }
    output.push(item);
  });
  return output;
};

const parseLog = (root: Record<string, unknown>, errors: string[]): LogConfig => {
  const rawLog = root.log;
  if (rawLog === undefined) {
    return DEFAULT_LOG;
  }
  if (!isRecord(rawLog)) {
    errors.push("log must be an object");
    return DEFAULT_LOG;
  }

  const level = rawLog.level;
  if (level === undefined) {
    return DEFAULT_LOG;
  }
  if (typeof level !== "string" || !LOG_LEVELS.has(level as LogLevel)) {
    errors.push("log.level must be one of debug, info, warn, error, silent");
    return DEFAULT_LOG;
  }

  return { level: level as LogLevel };
};

const parseLimits = (root: Record<string, unknown>, errors: string[]): LimitConfig => {
  const rawLimits = root.limits;
  if (rawLimits === undefined) {
    return DEFAULT_LIMITS;
  }
  if (!isRecord(rawLimits)) {
    errors.push("limits must be an object");
    return DEFAULT_LIMITS;
  }

  return {
    connectTimeoutMs: readOptionalNumber(rawLimits, "connectTimeoutMs", "limits", errors, 1, 300_000) ?? DEFAULT_LIMITS.connectTimeoutMs,
    handshakeTimeoutMs:
      readOptionalNumber(rawLimits, "handshakeTimeoutMs", "limits", errors, 1, 300_000) ?? DEFAULT_LIMITS.handshakeTimeoutMs,
    idleTimeoutMs: readOptionalNumber(rawLimits, "idleTimeoutMs", "limits", errors, 1, 3_600_000) ?? DEFAULT_LIMITS.idleTimeoutMs,
    shutdownTimeoutMs: readOptionalNumber(rawLimits, "shutdownTimeoutMs", "limits", errors, 1, 300_000) ?? DEFAULT_LIMITS.shutdownTimeoutMs,
    maxHeaderBytes: readOptionalNumber(rawLimits, "maxHeaderBytes", "limits", errors, 1024, 1024 * 1024) ?? DEFAULT_LIMITS.maxHeaderBytes,
    maxConnections:
      readOptionalNumber(rawLimits, "maxConnections", "limits", errors, 1, 1_000_000) ?? DEFAULT_LIMITS.maxConnections,
    leakReportIntervalMs:
      readOptionalNumber(rawLimits, "leakReportIntervalMs", "limits", errors, 1_000, 3_600_000) ?? DEFAULT_LIMITS.leakReportIntervalMs
  };
};

const parseDns = (root: Record<string, unknown>, errors: string[]): DnsConfig => {
  const rawDns = root.dns;
  if (rawDns === undefined) {
    return DEFAULT_DNS;
  }
  if (!isRecord(rawDns)) {
    errors.push("dns must be an object");
    return DEFAULT_DNS;
  }

  const strategy = rawDns.strategy;
  if (strategy !== undefined && (typeof strategy !== "string" || !DNS_STRATEGIES.has(strategy as DnsConfig["strategy"]))) {
    errors.push("dns.strategy must be one of system, prefer-ipv4, prefer-ipv6");
  }

  return {
    strategy: typeof strategy === "string" && DNS_STRATEGIES.has(strategy as DnsConfig["strategy"]) ? (strategy as DnsConfig["strategy"]) : "system",
    cacheTtlMs: readOptionalNumber(rawDns, "cacheTtlMs", "dns", errors, 1, 3_600_000) ?? DEFAULT_DNS.cacheTtlMs,
    hosts: readStringRecord(rawDns, "hosts", "dns", errors) ?? DEFAULT_DNS.hosts
  };
};

const parseGeo = (root: Record<string, unknown>, errors: string[]): GeoConfig => {
  const rawGeo = root.geo;
  if (rawGeo === undefined) {
    return DEFAULT_GEO;
  }
  if (!isRecord(rawGeo)) {
    errors.push("geo must be an object");
    return DEFAULT_GEO;
  }

  return {
    geoip: readStringArrayRecord(rawGeo, "geoip", "geo", errors) ?? DEFAULT_GEO.geoip,
    geosite: readStringArrayRecord(rawGeo, "geosite", "geo", errors) ?? DEFAULT_GEO.geosite
  };
};

const parsePluginModule = (value: unknown, path: string, errors: string[]): PluginModuleConfig | undefined => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const tag = readString(value, "tag", path, errors);
  const modulePath = readString(value, "path", path, errors);
  const enabled = readOptionalBoolean(value, "enabled", path, errors) ?? true;
  if (tag === undefined || modulePath === undefined) {
    return undefined;
  }
  return { tag, path: modulePath, enabled };
};

const parseWasmExtension = (value: unknown, path: string, errors: string[]): WasmExtensionConfig | undefined => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const tag = readString(value, "tag", path, errors);
  const wasmPath = readString(value, "path", path, errors);
  const enabled = readOptionalBoolean(value, "enabled", path, errors) ?? true;
  if (tag === undefined || wasmPath === undefined) {
    return undefined;
  }
  return { tag, path: wasmPath, enabled };
};

const parsePlugins = (root: Record<string, unknown>, errors: string[]): PluginConfig => {
  const rawPlugins = root.plugins;
  if (rawPlugins === undefined) {
    return DEFAULT_PLUGINS;
  }
  if (!isRecord(rawPlugins)) {
    errors.push("plugins must be an object");
    return DEFAULT_PLUGINS;
  }

  const rawModules = rawPlugins.modules;
  const modules =
    rawModules === undefined
      ? []
      : Array.isArray(rawModules)
        ? rawModules
            .map((moduleConfig, index) => parsePluginModule(moduleConfig, `plugins.modules[${index}]`, errors))
            .filter((moduleConfig): moduleConfig is PluginModuleConfig => moduleConfig !== undefined)
        : [];
  if (rawModules !== undefined && !Array.isArray(rawModules)) {
    errors.push("plugins.modules must be an array when provided");
  }

  const rawWasm = rawPlugins.wasm;
  const wasm =
    rawWasm === undefined
      ? []
      : Array.isArray(rawWasm)
        ? rawWasm
            .map((wasmConfig, index) => parseWasmExtension(wasmConfig, `plugins.wasm[${index}]`, errors))
            .filter((wasmConfig): wasmConfig is WasmExtensionConfig => wasmConfig !== undefined)
        : [];
  if (rawWasm !== undefined && !Array.isArray(rawWasm)) {
    errors.push("plugins.wasm must be an array when provided");
  }

  return { modules, wasm };
};

const parseWorkers = (root: Record<string, unknown>, errors: string[]): WorkerConfig => {
  const rawWorkers = root.workers;
  if (rawWorkers === undefined) {
    return DEFAULT_WORKERS;
  }
  if (!isRecord(rawWorkers)) {
    errors.push("workers must be an object");
    return DEFAULT_WORKERS;
  }

  return {
    enabled: readOptionalBoolean(rawWorkers, "enabled", "workers", errors) ?? DEFAULT_WORKERS.enabled,
    size: readOptionalNumber(rawWorkers, "size", "workers", errors, 1, 128) ?? DEFAULT_WORKERS.size,
    taskTimeoutMs: readOptionalNumber(rawWorkers, "taskTimeoutMs", "workers", errors, 1, 3_600_000) ?? DEFAULT_WORKERS.taskTimeoutMs
  };
};

const parseTransport = (root: Record<string, unknown>, errors: string[]): TransportConfig => {
  const rawTransport = root.transport;
  if (rawTransport === undefined) {
    return DEFAULT_TRANSPORT;
  }
  if (!isRecord(rawTransport)) {
    errors.push("transport must be an object");
    return DEFAULT_TRANSPORT;
  }

  const rawQuic = rawTransport.quic;
  if (rawQuic === undefined) {
    return DEFAULT_TRANSPORT;
  }
  if (!isRecord(rawQuic)) {
    errors.push("transport.quic must be an object when provided");
    return DEFAULT_TRANSPORT;
  }

  return {
    quic: {
      enabled: readOptionalBoolean(rawQuic, "enabled", "transport.quic", errors) ?? DEFAULT_TRANSPORT.quic.enabled,
      handshakeTimeoutMs:
        readOptionalNumber(rawQuic, "handshakeTimeoutMs", "transport.quic", errors, 1, 300_000) ??
        DEFAULT_TRANSPORT.quic.handshakeTimeoutMs
    }
  };
};

const parseConnectionPool = (root: Record<string, unknown>, errors: string[]): ConnectionPoolConfig => {
  const rawPool = root.connectionPool;
  if (rawPool === undefined) {
    return DEFAULT_CONNECTION_POOL;
  }
  if (!isRecord(rawPool)) {
    errors.push("connectionPool must be an object");
    return DEFAULT_CONNECTION_POOL;
  }

  return {
    enabled: readOptionalBoolean(rawPool, "enabled", "connectionPool", errors) ?? DEFAULT_CONNECTION_POOL.enabled,
    maxIdlePerEndpoint:
      readOptionalNumber(rawPool, "maxIdlePerEndpoint", "connectionPool", errors, 0, 10_000) ??
      DEFAULT_CONNECTION_POOL.maxIdlePerEndpoint,
    idleTimeoutMs:
      readOptionalNumber(rawPool, "idleTimeoutMs", "connectionPool", errors, 1, 3_600_000) ?? DEFAULT_CONNECTION_POOL.idleTimeoutMs
  };
};

const parseHotReload = (root: Record<string, unknown>, errors: string[]): HotReloadConfig => {
  const rawHotReload = root.hotReload;
  if (rawHotReload === undefined) {
    return DEFAULT_HOT_RELOAD;
  }
  if (!isRecord(rawHotReload)) {
    errors.push("hotReload must be an object");
    return DEFAULT_HOT_RELOAD;
  }

  return {
    enabled: readOptionalBoolean(rawHotReload, "enabled", "hotReload", errors) ?? DEFAULT_HOT_RELOAD.enabled,
    debounceMs: readOptionalNumber(rawHotReload, "debounceMs", "hotReload", errors, 10, 60_000) ?? DEFAULT_HOT_RELOAD.debounceMs
  };
};

const parseInbound = (value: unknown, path: string, errors: string[]): InboundConfig | undefined => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const type = readString(value, "type", path, errors);
  const tag = readString(value, "tag", path, errors);
  const listen = readString(value, "listen", path, errors);
  const port = readNumber(value, "port", path, errors, 0, 65_535);
  const connectTimeoutMs = readOptionalNumber(value, "connectTimeoutMs", path, errors, 1, 300_000);
  const idleTimeoutMs = readOptionalNumber(value, "idleTimeoutMs", path, errors, 1, 3_600_000);
  const maxHeaderBytes = readOptionalNumber(value, "maxHeaderBytes", path, errors, 1024, 1024 * 1024);

  if (type === undefined || tag === undefined || listen === undefined || port === undefined) {
    return undefined;
  }

  const optional: { connectTimeoutMs?: number; idleTimeoutMs?: number; maxHeaderBytes?: number } = {};
  if (connectTimeoutMs !== undefined) {
    optional.connectTimeoutMs = connectTimeoutMs;
  }
  if (idleTimeoutMs !== undefined) {
    optional.idleTimeoutMs = idleTimeoutMs;
  }
  if (maxHeaderBytes !== undefined) {
    optional.maxHeaderBytes = maxHeaderBytes;
  }

  if (type === "http") {
    return { type, tag, listen, port, ...optional } satisfies HttpInboundConfig;
  }
  if (type === "socks5") {
    const udpAssociate = value.udpAssociate;
    const socksOptional: { udpAssociate?: boolean } = {};
    if (udpAssociate !== undefined) {
      if (typeof udpAssociate !== "boolean") {
        errors.push(`${path}.udpAssociate must be a boolean when provided`);
      } else {
        socksOptional.udpAssociate = udpAssociate;
      }
    }
    return { type, tag, listen, port, ...optional, ...socksOptional } satisfies Socks5InboundConfig;
  }

  if (isExtensionType(type)) {
    return { type, tag, listen, port, options: readOptionsRecord(value, "options", path, errors), ...optional } satisfies PluginInboundConfig;
  }

  errors.push(`${path}.type must be "http", "socks5", or start with "plugin."`);
  return undefined;
};

const parseOutbound = (value: unknown, path: string, errors: string[]): OutboundConfig | undefined => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const type = readString(value, "type", path, errors);
  const tag = readString(value, "tag", path, errors);
  const connectTimeoutMs = readOptionalNumber(value, "connectTimeoutMs", path, errors, 1, 300_000);
  const idleTimeoutMs = readOptionalNumber(value, "idleTimeoutMs", path, errors, 1, 3_600_000);

  if (type === undefined || tag === undefined) {
    return undefined;
  }

  const optional: { connectTimeoutMs?: number; idleTimeoutMs?: number } = {};
  if (connectTimeoutMs !== undefined) {
    optional.connectTimeoutMs = connectTimeoutMs;
  }
  if (idleTimeoutMs !== undefined) {
    optional.idleTimeoutMs = idleTimeoutMs;
  }

  if (type === "direct") {
    return { type, tag, ...optional } satisfies DirectOutboundConfig;
  }
  if (type === "block") {
    const reason = readOptionalString(value, "reason", path, errors);
    const blockOptional: { reason?: string } = {};
    if (reason !== undefined) {
      blockOptional.reason = reason;
    }
    return { type, tag, ...optional, ...blockOptional } satisfies BlockOutboundConfig;
  }
  if (type === "tcpRelay") {
    const targetHost = readString(value, "targetHost", path, errors);
    const targetPort = readNumber(value, "targetPort", path, errors, 1, 65_535);
    if (targetHost === undefined || targetPort === undefined) {
      return undefined;
    }
    return { type, tag, targetHost, targetPort, ...optional } satisfies TcpRelayOutboundConfig;
  }

  if (type === "shadowsocks") {
    const serverHost = readString(value, "serverHost", path, errors);
    const serverPort = readNumber(value, "serverPort", path, errors, 1, 65_535);
    const method = readString(value, "method", path, errors);
    const password = readString(value, "password", path, errors);
    if (method !== undefined && !SHADOWSOCKS_METHODS.has(method as ShadowsocksOutboundConfig["method"])) {
      errors.push(`${path}.method must be one of aes-128-gcm, aes-256-gcm, chacha20-ietf-poly1305`);
    }
    if (serverHost === undefined || serverPort === undefined || method === undefined || password === undefined) {
      return undefined;
    }
    return {
      type,
      tag,
      serverHost,
      serverPort,
      method: method as ShadowsocksOutboundConfig["method"],
      password,
      ...optional
    } satisfies ShadowsocksOutboundConfig;
  }

  if (type === "trojan") {
    const serverHost = readString(value, "serverHost", path, errors);
    const serverPort = readNumber(value, "serverPort", path, errors, 1, 65_535);
    const password = readString(value, "password", path, errors);
    const rawTls = value.tls;
    const tlsPath = `${path}.tls`;
    let tls: TrojanOutboundConfig["tls"] = { enabled: true, rejectUnauthorized: true };
    if (rawTls !== undefined) {
      if (!isRecord(rawTls)) {
        errors.push(`${tlsPath} must be an object when provided`);
      } else {
        const enabled = readOptionalBoolean(rawTls, "enabled", tlsPath, errors) ?? true;
        const rejectUnauthorized = readOptionalBoolean(rawTls, "rejectUnauthorized", tlsPath, errors) ?? true;
        const serverName = readOptionalString(rawTls, "serverName", tlsPath, errors);
        tls = {
          enabled,
          rejectUnauthorized,
          ...(serverName === undefined ? {} : { serverName })
        };
      }
    }
    if (serverHost === undefined || serverPort === undefined || password === undefined) {
      return undefined;
    }
    return { type, tag, serverHost, serverPort, password, tls, ...optional } satisfies TrojanOutboundConfig;
  }

  if (type === "wireguard") {
    const privateKey = readString(value, "privateKey", path, errors);
    const address = readStringArray(value, "address", path, errors);
    const rawPeer = value.peer;
    if (!isRecord(rawPeer)) {
      errors.push(`${path}.peer must be an object`);
      return undefined;
    }
    const publicKey = readString(rawPeer, "publicKey", `${path}.peer`, errors);
    const endpointHost = readString(rawPeer, "endpointHost", `${path}.peer`, errors);
    const endpointPort = readNumber(rawPeer, "endpointPort", `${path}.peer`, errors, 1, 65_535);
    const allowedIps = readStringArray(rawPeer, "allowedIps", `${path}.peer`, errors);
    const reserved = readByteArray(value, "reserved", path, errors);
    if (
      privateKey === undefined ||
      address === undefined ||
      publicKey === undefined ||
      endpointHost === undefined ||
      endpointPort === undefined ||
      allowedIps === undefined
    ) {
      return undefined;
    }
    return {
      type,
      tag,
      privateKey,
      address,
      peer: { publicKey, endpointHost, endpointPort, allowedIps },
      ...(reserved === undefined ? {} : { reserved }),
      ...optional
    } satisfies WireGuardOutboundConfig;
  }

  if (isExtensionType(type)) {
    return { type, tag, options: readOptionsRecord(value, "options", path, errors), ...optional } satisfies PluginOutboundConfig;
  }

  errors.push(`${path}.type must be "direct", "block", "tcpRelay", "shadowsocks", "trojan", "wireguard", or start with "plugin."`);
  return undefined;
};

const parseRouteRule = (value: unknown, path: string, errors: string[], geo: GeoConfig): RouteRuleConfig | undefined => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const outboundTag = readString(value, "outboundTag", path, errors);
  if (outboundTag === undefined) {
    return undefined;
  }

  const tag = readOptionalString(value, "tag", path, errors);
  const domain = readStringArray(value, "domain", path, errors);
  const domainSuffix = readStringArray(value, "domainSuffix", path, errors);
  const ipCidr = readStringArray(value, "ipCidr", path, errors);
  const geoIp = readStringArray(value, "geoIp", path, errors);
  const geoSite = readStringArray(value, "geoSite", path, errors);
  const port = readPortArray(value, "port", path, errors);

  const expandedGeoIp = expandGeoIp(geoIp, geo, path, errors);
  const expandedGeoSite = expandGeoSite(geoSite, geo, path, errors);
  const mergedIpCidr = [...(ipCidr ?? []), ...expandedGeoIp];
  const mergedDomainSuffix = [...(domainSuffix ?? []), ...expandedGeoSite];

  mergedIpCidr.forEach((cidr, index) => {
    if (!isValidCidr(cidr)) {
      errors.push(`${path}.ipCidr[${index}] must be a valid CIDR`);
    }
  });

  const optional: {
    tag?: string;
    domain?: readonly string[];
    domainSuffix?: readonly string[];
    ipCidr?: readonly string[];
    geoIp?: readonly string[];
    geoSite?: readonly string[];
    port?: readonly number[];
  } = {};
  if (tag !== undefined) {
    optional.tag = tag;
  }
  if (domain !== undefined) {
    optional.domain = domain;
  }
  if (mergedDomainSuffix.length > 0) {
    optional.domainSuffix = mergedDomainSuffix;
  }
  if (mergedIpCidr.length > 0) {
    optional.ipCidr = mergedIpCidr;
  }
  if (geoIp !== undefined) {
    optional.geoIp = geoIp;
  }
  if (geoSite !== undefined) {
    optional.geoSite = geoSite;
  }
  if (port !== undefined) {
    optional.port = port;
  }

  return { outboundTag, ...optional };
};

const expandGeoIp = (tags: readonly string[] | undefined, geo: GeoConfig, path: string, errors: string[]): readonly string[] => {
  if (tags === undefined) {
    return [];
  }
  const cidrs: string[] = [];
  tags.forEach((tag) => {
    const values = geo.geoip[tag.toLowerCase()];
    if (values === undefined) {
      errors.push(`${path}.geoIp references unknown GeoIP tag "${tag}"`);
      return;
    }
    cidrs.push(...values);
  });
  return cidrs;
};

const expandGeoSite = (tags: readonly string[] | undefined, geo: GeoConfig, path: string, errors: string[]): readonly string[] => {
  if (tags === undefined) {
    return [];
  }
  const domains: string[] = [];
  tags.forEach((tag) => {
    const values = geo.geosite[tag.toLowerCase()];
    if (values === undefined) {
      errors.push(`${path}.geoSite references unknown GeoSite tag "${tag}"`);
      return;
    }
    domains.push(...values);
  });
  return domains;
};

const parseRouteRuleSetFile = (value: unknown, path: string, errors: string[]): RouteRuleSetFileConfig | undefined => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const tag = readString(value, "tag", path, errors);
  const filePath = readString(value, "path", path, errors);
  const outboundTag = readString(value, "outboundTag", path, errors);

  if (tag === undefined || filePath === undefined || outboundTag === undefined) {
    return undefined;
  }

  return {
    tag,
    path: filePath,
    outboundTag
  };
};

const parseRoutingPolicy = (value: unknown, path: string, errors: string[]): RoutingPolicyConfig | undefined => {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`);
    return undefined;
  }

  const tag = readString(value, "tag", path, errors);
  const type = readString(value, "type", path, errors);
  const outbounds = readStringArray(value, "outbounds", path, errors);
  if (type !== undefined && !ROUTING_POLICY_TYPES.has(type as RoutingPolicyType)) {
    errors.push(`${path}.type must be "loadBalance" or "failover"`);
  }
  const rawStrategy = value.strategy;
  if (rawStrategy !== undefined && (typeof rawStrategy !== "string" || !LOAD_BALANCE_STRATEGIES.has(rawStrategy as LoadBalanceStrategy))) {
    errors.push(`${path}.strategy must be "roundRobin", "leastLatency", or "random" when provided`);
  }

  if (tag === undefined || type === undefined || outbounds === undefined) {
    return undefined;
  }
  if (outbounds.length === 0) {
    errors.push(`${path}.outbounds must contain at least one outbound tag`);
  }

  const strategy =
    typeof rawStrategy === "string" && LOAD_BALANCE_STRATEGIES.has(rawStrategy as LoadBalanceStrategy)
      ? (rawStrategy as LoadBalanceStrategy)
      : "roundRobin";

  return {
    tag,
    type: type as RoutingPolicyType,
    outbounds,
    strategy,
    unhealthyAfterFailures: readOptionalNumber(value, "unhealthyAfterFailures", path, errors, 1, 1_000) ?? 3,
    recoverAfterMs: readOptionalNumber(value, "recoverAfterMs", path, errors, 1, 3_600_000) ?? 30_000
  };
};

const parseRouter = (root: Record<string, unknown>, errors: string[], geo: GeoConfig): RouterConfig | undefined => {
  const rawRoute = root.route;
  if (!isRecord(rawRoute)) {
    errors.push("route must be an object");
    return undefined;
  }

  const defaultOutbound = readString(rawRoute, "defaultOutbound", "route", errors);
  const rawRules = rawRoute.rules;
  if (!Array.isArray(rawRules)) {
    errors.push("route.rules must be an array");
    return undefined;
  }

  const rules = rawRules
    .map((rule, index) => parseRouteRule(rule, `route.rules[${index}]`, errors, geo))
    .filter((rule): rule is RouteRuleConfig => rule !== undefined);

  const rawRuleSetFiles = rawRoute.ruleSetFiles;
  const ruleSetFiles =
    rawRuleSetFiles === undefined
      ? []
      : Array.isArray(rawRuleSetFiles)
        ? rawRuleSetFiles
            .map((ruleSet, index) => parseRouteRuleSetFile(ruleSet, `route.ruleSetFiles[${index}]`, errors))
            .filter((ruleSet): ruleSet is RouteRuleSetFileConfig => ruleSet !== undefined)
        : [];

  if (rawRuleSetFiles !== undefined && !Array.isArray(rawRuleSetFiles)) {
    errors.push("route.ruleSetFiles must be an array when provided");
  }

  const rawPolicies = rawRoute.policies;
  const policies =
    rawPolicies === undefined
      ? []
      : Array.isArray(rawPolicies)
        ? rawPolicies
            .map((policy, index) => parseRoutingPolicy(policy, `route.policies[${index}]`, errors))
            .filter((policy): policy is RoutingPolicyConfig => policy !== undefined)
        : [];
  if (rawPolicies !== undefined && !Array.isArray(rawPolicies)) {
    errors.push("route.policies must be an array when provided");
  }

  if (defaultOutbound === undefined) {
    return undefined;
  }

  return { defaultOutbound, rules, ruleSetFiles, policies };
};

const checkUniqueTags = (items: readonly { readonly tag: string }[], path: string, errors: string[]): void => {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.tag)) {
      errors.push(`${path} contains duplicate tag "${item.tag}"`);
      continue;
    }
    seen.add(item.tag);
  }
};

const checkOutboundReferences = (config: SepigsConfig, errors: string[]): void => {
  const outboundTags = new Set(config.outbounds.map((outbound) => outbound.tag));
  const policyTags = new Set(config.route.policies.map((policy) => policy.tag));
  const routeTargets = new Set([...outboundTags, ...policyTags]);

  for (const policy of config.route.policies) {
    if (outboundTags.has(policy.tag)) {
      errors.push(`route.policies contains tag "${policy.tag}" that duplicates an outbound tag`);
    }
  }

  if (!routeTargets.has(config.route.defaultOutbound)) {
    errors.push(`route.defaultOutbound references unknown outbound "${config.route.defaultOutbound}"`);
  }

  config.route.rules.forEach((rule, index) => {
    if (!routeTargets.has(rule.outboundTag)) {
      errors.push(`route.rules[${index}].outboundTag references unknown outbound "${rule.outboundTag}"`);
    }
  });

  config.route.ruleSetFiles.forEach((ruleSet, index) => {
    if (!routeTargets.has(ruleSet.outboundTag)) {
      errors.push(`route.ruleSetFiles[${index}].outboundTag references unknown outbound "${ruleSet.outboundTag}"`);
    }
  });

  config.route.policies.forEach((policy, policyIndex) => {
    policy.outbounds.forEach((outboundTag, outboundIndex) => {
      if (!outboundTags.has(outboundTag)) {
        errors.push(`route.policies[${policyIndex}].outbounds[${outboundIndex}] references unknown outbound "${outboundTag}"`);
      }
    });
  });
};

export const parseConfig = (input: unknown): SepigsConfig => {
  const errors: string[] = [];
  if (!isRecord(input)) {
    throw new ConfigError("config root must be an object");
  }

  const log = parseLog(input, errors);
  const limits = parseLimits(input, errors);
  const dns = parseDns(input, errors);
  const geo = parseGeo(input, errors);
  const plugins = parsePlugins(input, errors);
  const workers = parseWorkers(input, errors);
  const transport = parseTransport(input, errors);
  const connectionPool = parseConnectionPool(input, errors);
  const hotReload = parseHotReload(input, errors);

  const rawInbounds = input.inbounds;
  if (!Array.isArray(rawInbounds) || rawInbounds.length === 0) {
    errors.push("inbounds must be a non-empty array");
  }
  const inbounds = Array.isArray(rawInbounds)
    ? rawInbounds
        .map((inbound, index) => parseInbound(inbound, `inbounds[${index}]`, errors))
        .filter((inbound): inbound is InboundConfig => inbound !== undefined)
    : [];

  const rawOutbounds = input.outbounds;
  if (!Array.isArray(rawOutbounds) || rawOutbounds.length === 0) {
    errors.push("outbounds must be a non-empty array");
  }
  const outbounds = Array.isArray(rawOutbounds)
    ? rawOutbounds
        .map((outbound, index) => parseOutbound(outbound, `outbounds[${index}]`, errors))
        .filter((outbound): outbound is OutboundConfig => outbound !== undefined)
    : [];

  const route = parseRouter(input, errors, geo);
  const config: SepigsConfig = {
    log,
    limits,
    dns,
    geo,
    plugins,
    workers,
    transport,
    connectionPool,
    hotReload,
    inbounds,
    outbounds,
    route: route ?? { defaultOutbound: "", rules: [], ruleSetFiles: [], policies: [] }
  };

  checkUniqueTags(config.inbounds, "inbounds", errors);
  checkUniqueTags(config.outbounds, "outbounds", errors);
  checkUniqueTags(config.plugins.modules, "plugins.modules", errors);
  checkUniqueTags(config.plugins.wasm, "plugins.wasm", errors);
  checkUniqueTags(config.route.policies, "route.policies", errors);
  if (route !== undefined) {
    checkOutboundReferences(config, errors);
  }

  if (errors.length > 0) {
    throw new ConfigError(`invalid sepigs config:\n${errors.map((error) => `- ${error}`).join("\n")}`);
  }

  return config;
};
