export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

export interface SepigsConfig {
  readonly configVersion: 1;
  readonly log: LogConfig;
  readonly limits: LimitConfig;
  readonly dns: DnsConfig;
  readonly geo: GeoConfig;
  readonly plugins: PluginConfig;
  readonly workers: WorkerConfig;
  readonly transport: TransportConfig;
  readonly connectionPool: ConnectionPoolConfig;
  readonly hotReload: HotReloadConfig;
  readonly reload: ReloadConfig;
  readonly probing: ProbingConfig;
  readonly observability: ObservabilityConfig;
  readonly dashboard: DashboardConfig;
  readonly tun: TunConfig;
  readonly inbounds: readonly InboundConfig[];
  readonly outbounds: readonly OutboundConfig[];
  readonly route: RouterConfig;
}

export interface LogConfig {
  readonly level: LogLevel;
}

export interface LimitConfig {
  readonly connectTimeoutMs: number;
  readonly handshakeTimeoutMs: number;
  readonly idleTimeoutMs: number;
  readonly shutdownTimeoutMs: number;
  readonly maxHeaderBytes: number;
  readonly maxConnections: number;
  readonly leakReportIntervalMs: number;
  readonly maxUdpSessions?: number;
  readonly udpIdleTimeoutMs?: number;
}

export interface DnsConfig {
  readonly strategy: "system" | "prefer-ipv4" | "prefer-ipv6";
  readonly cacheTtlMs: number;
  readonly cacheMaxEntries?: number;
  readonly negativeTtlMs?: number;
  readonly hosts: Readonly<Record<string, string>>;
  readonly udpServers: readonly DnsUdpServerConfig[];
  readonly rules: readonly DnsRouteRuleConfig[];
  readonly fallbackHosts: Readonly<Record<string, string>>;
  readonly fakeIp: FakeIpConfig;
  readonly doh: DohConfig;
}

export interface DnsUdpServerConfig {
  readonly tag: string;
  readonly address: string;
  readonly port: number;
  readonly timeoutMs: number;
}

export interface DnsRouteRuleConfig {
  readonly domainSuffix: readonly string[];
  readonly serverTag: string;
}

export interface FakeIpConfig {
  readonly enabled: boolean;
  readonly range?: string;
  readonly cidr?: string;
  readonly size?: number;
  readonly ttlSeconds?: number;
  readonly persistPath?: string;
}

export interface DashboardConfig {
  readonly enabled: boolean;
  readonly listen: string;
  readonly port: number;
  readonly token: string;
  readonly rateLimitPerMinute: number;
  readonly cors: boolean;
}

export interface TunConfig {
  readonly enabled: boolean;
  readonly experimental: boolean;
  readonly name: string;
  readonly mtu: number;
}

export interface DohConfig {
  readonly enabled: boolean;
  readonly endpoints: readonly string[];
  readonly timeoutMs: number;
}

export interface GeoConfig {
  readonly geoip: Readonly<Record<string, readonly string[]>>;
  readonly geosite: Readonly<Record<string, readonly string[]>>;
}

export type ExtensionType = `plugin.${string}`;

export interface PluginConfig {
  readonly modules: readonly PluginModuleConfig[];
  readonly wasm: readonly WasmExtensionConfig[];
  readonly isolation: PluginIsolationConfig;
}

export interface PluginModuleConfig {
  readonly tag: string;
  readonly path: string;
  readonly enabled: boolean;
  readonly manifest?: string;
}

export interface WasmExtensionConfig {
  readonly tag: string;
  readonly path: string;
  readonly enabled: boolean;
}

export type PluginIsolationMode = "in-process" | "worker-thread" | "child-process";

export interface PluginIsolationConfig {
  readonly mode: PluginIsolationMode;
  readonly timeoutMs: number;
  readonly memoryLimitMb: number;
  readonly stdoutLimitBytes: number;
}

export interface WorkerConfig {
  readonly enabled: boolean;
  readonly size: number;
  readonly taskTimeoutMs: number;
}

export interface QuicTransportConfig {
  readonly enabled: boolean;
  readonly handshakeTimeoutMs: number;
}

export interface TransportConfig {
  readonly quic: QuicTransportConfig;
}

export interface ConnectionPoolConfig {
  readonly enabled: boolean;
  readonly maxIdlePerEndpoint: number;
  readonly idleTimeoutMs: number;
}

export interface HotReloadConfig {
  readonly enabled: boolean;
  readonly debounceMs: number;
}

export type TransactionalReloadComponent = "metrics" | "dashboard" | "router" | "policy";

export interface TransactionalReloadConfig {
  readonly enabledComponents: readonly TransactionalReloadComponent[];
  readonly timeoutMs: number;
  readonly shadowBeforeCommit: boolean;
  readonly rollbackOnFailure: boolean;
}

export interface ReloadConfig {
  readonly mode: "legacy" | "transactional-experimental";
  readonly transactional: TransactionalReloadConfig;
}

export interface ProbingConfig {
  readonly enabled: boolean;
  readonly intervalMs: number;
  readonly timeoutMs: number;
  readonly maxConcurrency: number;
  readonly budgetPerInterval: number;
  readonly backoffBaseMs: number;
  readonly backoffMaxMs: number;
}

export interface ObservabilityConfig {
  readonly metrics: MetricsServerConfig;
}

export interface MetricsServerConfig {
  readonly enabled: boolean;
  readonly listen: string;
  readonly port: number;
  readonly path: string;
}

export type InboundConfig = HttpInboundConfig | Socks5InboundConfig | ShadowsocksInboundConfig | TrojanInboundConfig | PluginInboundConfig;

export interface InboundBaseConfig {
  readonly tag: string;
  readonly listen: string;
  readonly port: number;
  readonly connectTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
  readonly maxHeaderBytes?: number;
}

export interface HttpInboundConfig extends InboundBaseConfig {
  readonly type: "http";
  readonly auth?: HttpBasicAuthConfig;
}

export interface Socks5InboundConfig extends InboundBaseConfig {
  readonly type: "socks5";
  readonly udpAssociate?: boolean;
  readonly auth?: Socks5AuthConfig;
}

export interface ShadowsocksInboundConfig extends InboundBaseConfig {
  readonly type: "shadowsocks";
  readonly method: ShadowsocksCipher;
  readonly password: string;
  readonly udp: boolean;
}

export interface TrojanInboundConfig extends InboundBaseConfig {
  readonly type: "trojan";
  readonly password: string;
  readonly tls: {
    readonly enabled: boolean;
    readonly certPath?: string;
    readonly keyPath?: string;
  };
}

export interface PluginInboundConfig extends InboundBaseConfig {
  readonly type: ExtensionType;
  readonly options: Readonly<Record<string, unknown>>;
}

export interface HttpBasicAuthConfig {
  readonly enabled: boolean;
  readonly username: string;
  readonly password: string;
}

export interface Socks5AuthConfig {
  readonly enabled: boolean;
  readonly username: string;
  readonly password: string;
}

export type OutboundConfig =
  | DirectOutboundConfig
  | BlockOutboundConfig
  | TcpRelayOutboundConfig
  | ShadowsocksOutboundConfig
  | TrojanOutboundConfig
  | WireGuardOutboundConfig
  | PluginOutboundConfig;

export interface OutboundBaseConfig {
  readonly tag: string;
  readonly connectTimeoutMs?: number;
  readonly idleTimeoutMs?: number;
}

export interface DirectOutboundConfig extends OutboundBaseConfig {
  readonly type: "direct";
}

export interface BlockOutboundConfig extends OutboundBaseConfig {
  readonly type: "block";
  readonly reason?: string;
}

export interface TcpRelayOutboundConfig extends OutboundBaseConfig {
  readonly type: "tcpRelay";
  readonly targetHost: string;
  readonly targetPort: number;
}

export type ShadowsocksCipher = "aes-128-gcm" | "aes-256-gcm" | "chacha20-ietf-poly1305";

export interface ShadowsocksOutboundConfig extends OutboundBaseConfig {
  readonly type: "shadowsocks";
  readonly serverHost: string;
  readonly serverPort: number;
  readonly method: ShadowsocksCipher;
  readonly password: string;
}

export interface TrojanTlsConfig {
  readonly enabled: boolean;
  readonly serverName?: string;
  readonly rejectUnauthorized: boolean;
}

export interface TrojanOutboundConfig extends OutboundBaseConfig {
  readonly type: "trojan";
  readonly serverHost: string;
  readonly serverPort: number;
  readonly password: string;
  readonly tls: TrojanTlsConfig;
}

export interface WireGuardPeerConfig {
  readonly publicKey: string;
  readonly endpointHost: string;
  readonly endpointPort: number;
  readonly allowedIps: readonly string[];
}

export interface WireGuardOutboundConfig extends OutboundBaseConfig {
  readonly type: "wireguard";
  readonly privateKey: string;
  readonly address: readonly string[];
  readonly peer: WireGuardPeerConfig;
  readonly reserved?: readonly number[];
}

export interface PluginOutboundConfig extends OutboundBaseConfig {
  readonly type: ExtensionType;
  readonly options: Readonly<Record<string, unknown>>;
}

export type RoutingPolicyType = "loadBalance" | "failover";
export type LoadBalanceStrategy = "roundRobin" | "leastLatency" | "random";

export interface RoutingPolicyConfig {
  readonly tag: string;
  readonly type: RoutingPolicyType;
  readonly outbounds: readonly string[];
  readonly strategy: LoadBalanceStrategy;
  readonly unhealthyAfterFailures: number;
  readonly recoverAfterMs: number;
}

export interface RouterConfig {
  readonly defaultOutbound: string;
  readonly rules: readonly RouteRuleConfig[];
  readonly ruleSetFiles: readonly RouteRuleSetFileConfig[];
  readonly policies: readonly RoutingPolicyConfig[];
}

export interface RouteRuleConfig {
  readonly tag?: string;
  readonly outboundTag: string;
  readonly domain?: readonly string[];
  readonly domainSuffix?: readonly string[];
  readonly ipCidr?: readonly string[];
  readonly geoIp?: readonly string[];
  readonly geoSite?: readonly string[];
  readonly port?: readonly number[];
}

export interface RouteRuleSetFileConfig {
  readonly tag: string;
  readonly path: string;
  readonly outboundTag: string;
}

export interface RawSepigsConfig {
  readonly log?: Partial<LogConfig>;
  readonly limits?: Partial<LimitConfig>;
  readonly plugins?: unknown;
  readonly workers?: Partial<WorkerConfig>;
  readonly transport?: unknown;
  readonly connectionPool?: Partial<ConnectionPoolConfig>;
  readonly hotReload?: Partial<HotReloadConfig>;
  readonly reload?: unknown;
  readonly probing?: Partial<ProbingConfig>;
  readonly inbounds?: readonly unknown[];
  readonly outbounds?: readonly unknown[];
  readonly route?: unknown;
}
