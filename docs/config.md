# Config

sepigs supports JSON and YAML config.

```json
{
  "log": { "level": "info" },
  "limits": {
    "connectTimeoutMs": 10000,
    "handshakeTimeoutMs": 10000,
    "idleTimeoutMs": 120000,
    "shutdownTimeoutMs": 5000,
    "maxHeaderBytes": 65536,
    "maxConnections": 10000,
    "leakReportIntervalMs": 60000
    ,"maxUdpSessions": 4096
    ,"udpIdleTimeoutMs": 60000
  },
  "dns": {
    "strategy": "system",
    "cacheTtlMs": 60000,
    "hosts": {
      "local.test": "127.0.0.1"
    }
  },
  "geo": {
    "geoip": {
      "private": ["10.0.0.0/8", "192.168.0.0/16"]
    },
    "geosite": {
      "example": ["example.com", "example.org"]
    }
  },
  "plugins": {
    "modules": [],
    "wasm": []
  },
  "workers": {
    "enabled": false,
    "size": 1,
    "taskTimeoutMs": 30000
  },
  "transport": {
    "quic": {
      "enabled": false,
      "handshakeTimeoutMs": 10000
    }
  },
  "connectionPool": {
    "enabled": false,
    "maxIdlePerEndpoint": 8,
    "idleTimeoutMs": 30000
  },
  "hotReload": {
    "enabled": false,
    "debounceMs": 250
  },
  "reload": {
    "mode": "legacy",
    "transactional": {
      "enabledComponents": [],
      "timeoutMs": 5000,
      "shadowBeforeCommit": true,
      "rollbackOnFailure": true
    }
  },
  "inbounds": [
    { "type": "http", "tag": "http-in", "listen": "127.0.0.1", "port": 8080 },
    { "type": "socks5", "tag": "socks-in", "listen": "127.0.0.1", "port": 1080 }
  ],
  "outbounds": [
    { "type": "direct", "tag": "direct" },
    { "type": "block", "tag": "block" }
  ],
  "route": {
    "defaultOutbound": "direct",
    "ruleSetFiles": [],
    "policies": [],
    "rules": [
      { "domainSuffix": ["blocked.example"], "outboundTag": "block" }
    ]
  }
}
```

## Log

`log.level` may be `debug`, `info`, `warn`, `error`, or `silent`. The default is `info`.

## Limits

- `connectTimeoutMs`: outbound TCP connect timeout.
- `handshakeTimeoutMs`: inbound protocol handshake timeout before a connection is recycled.
- `idleTimeoutMs`: inactivity timeout once a tunnel is established.
- `shutdownTimeoutMs`: graceful stop budget.
- `maxHeaderBytes`: maximum bytes for HTTP headers and SOCKS5 handshake data.
- `maxConnections`: maximum active managed connections before new connections are rejected.
- `leakReportIntervalMs`: interval for leak detector status logging.
- `maxUdpSessions`: maximum active UDP associations.
- `udpIdleTimeoutMs`: idle reclaim timeout for UDP associations.

## Phase 8 Optional Systems

`dns.cacheMaxEntries` bounds positive and negative cache entries; `dns.negativeTtlMs` controls failure caching. Fake-IP options are documented in [fake-ip.md](fake-ip.md).

`dashboard` and `tun` are disabled by default. Dashboard requires a local address and a token of at least 16 characters. TUN must remain marked experimental. Shadowsocks and Trojan TCP inbound examples:

## Reload Mode

`reload.mode` defaults to `legacy`, including when the `reload` object is
absent. `transactional-experimental` must be explicitly selected.

M11 accepts `metrics`, `dashboard`, `router`, `policy`, `dns`, and `outbound` in
`reload.transactional.enabledComponents`. Every changed component must be
listed explicitly. `rollbackOnFailure` must be `true`.
`shadowBeforeCommit` runs a prototype-only preflight before real adapters.
Unsupported data-plane changes are rejected and are not automatically retried
through legacy reload.

DNS reload applies only to new queries. Existing in-flight queries complete
against their captured generation. Compatible unexpired positive cache may be
copied by value with shortened TTL; negative, sensitive, synthetic, expired,
upstream-changed, or mode-changed entries are dropped. Any fake-IP config
difference rejects the transaction as unsupported/high-risk.

Transactional outbound reload accepts only `direct`, `block`, and `tcpRelay`.
Shadowsocks, Trojan, WireGuard, plugin, and unknown outbound types are
rejected before publication. TCP connections keep the outbound generation
acquired during setup until their socket closes. UDP remains on the legacy
path and is not switched by M11.

The runnable local-only example is
`examples/sepigs.transactional-reload.experimental.json`. It uses loopback and
ephemeral ports. Dashboard remains disabled with a placeholder token in the
file; `reload:runtime-smoke` enables it in memory with an ephemeral test token.

The DNS-specific local-only example is
`examples/sepigs.transactional-dns.experimental.json`:

```bash
npm run reload:runtime-smoke:dns -- \
  --config examples/sepigs.transactional-dns.experimental.json
```

The M11 outbound example and loopback smoke are:

```bash
npm run reload:runtime-smoke:m11 -- \
  --config examples/sepigs.transactional-outbound.experimental.json
```

```json
{"type":"shadowsocks","tag":"ss-in","listen":"127.0.0.1","port":8388,"method":"aes-128-gcm","password":"change-me","udp":false}
```

```json
{"type":"trojan","tag":"trojan-in","listen":"127.0.0.1","port":8443,"password":"change-me","tls":{"enabled":true,"certPath":"cert.pem","keyPath":"key.pem"}}
```

## Inbounds

HTTP inbound:

```json
{ "type": "http", "tag": "http-in", "listen": "127.0.0.1", "port": 8080 }
```

SOCKS5 inbound:

```json
{ "type": "socks5", "tag": "socks-in", "listen": "127.0.0.1", "port": 1080, "udpAssociate": true }
```

`udpAssociate` enables SOCKS5 UDP ASSOCIATE. UDP currently works with outbounds that implement UDP, such as `direct`. Unsupported outbound types fail clearly instead of silently dropping protocol state.

## Outbounds

Direct:

```json
{ "type": "direct", "tag": "direct" }
```

Block:

```json
{ "type": "block", "tag": "block", "reason": "blocked by rule" }
```

TCP relay:

```json
{ "type": "tcpRelay", "tag": "relay", "targetHost": "127.0.0.1", "targetPort": 9000 }
```

Shadowsocks:

```json
{
  "type": "shadowsocks",
  "tag": "ss",
  "serverHost": "127.0.0.1",
  "serverPort": 8388,
  "method": "aes-128-gcm",
  "password": "secret"
}
```

Supported methods are `aes-128-gcm`, `aes-256-gcm`, and `chacha20-ietf-poly1305`.

Trojan:

```json
{
  "type": "trojan",
  "tag": "trojan",
  "serverHost": "trojan.example",
  "serverPort": 443,
  "password": "secret",
  "tls": { "enabled": true, "serverName": "trojan.example", "rejectUnauthorized": true }
}
```

WireGuard outbound:

```json
{
  "type": "wireguard",
  "tag": "wg",
  "privateKey": "...",
  "address": ["10.0.0.2/32"],
  "peer": {
    "publicKey": "...",
    "endpointHost": "wg.example",
    "endpointPort": 51820,
    "allowedIps": ["0.0.0.0/0"]
  }
}
```

WireGuard config is validated and registered through the unified outbound interface. Full packet tunnel transport is not active yet, so traffic through this outbound fails clearly instead of pretending to proxy TCP streams.

Plugin outbound:

```json
{
  "type": "plugin.example",
  "tag": "example-plugin-out",
  "options": {
    "key": "value"
  }
}
```

Plugin types must start with `plugin.` and must be registered by a dynamic plugin module before the engine builds components.

## Route Rules

Rules are evaluated in order. A rule matches when every provided condition matches.

- `domain`: exact domain match.
- `domainSuffix`: suffix match, including subdomains.
- `ipCidr`: IPv4 or IPv6 CIDR match.
- `geoIp`: expands configured `geo.geoip` tags into `ipCidr`.
- `geoSite`: expands configured `geo.geosite` tags into `domainSuffix`.
- `port`: one port or an array of ports.
- `outboundTag`: selected outbound when matched.

If no rule matches, `route.defaultOutbound` is used.

## Routing Policies

`route.defaultOutbound` and rule `outboundTag` may point either to a real outbound tag or to a policy tag.

```json
{
  "route": {
    "defaultOutbound": "auto",
    "policies": [
      {
        "tag": "auto",
        "type": "loadBalance",
        "outbounds": ["direct-a", "direct-b"],
        "strategy": "leastLatency",
        "unhealthyAfterFailures": 3,
        "recoverAfterMs": 30000
      },
      {
        "tag": "fallback",
        "type": "failover",
        "outbounds": ["relay-a", "relay-b"],
        "strategy": "roundRobin",
        "unhealthyAfterFailures": 1,
        "recoverAfterMs": 10000
      }
    ],
    "rules": []
  }
}
```

Policy `outbounds` must reference real outbounds, not other policies. Supported strategies are `roundRobin`, `leastLatency`, and `random`.

## Rule-Set Files

`route.ruleSetFiles` loads JSON or YAML files and expands their rules before inline `route.rules`.

```json
{
  "route": {
    "defaultOutbound": "direct",
    "ruleSetFiles": [
      { "tag": "local-blocklist", "path": "rules/blocklist.yaml", "outboundTag": "block" }
    ],
    "rules": []
  }
}
```

Rule-set file:

```yaml
rules:
  - tag: blocked-domain
    domainSuffix:
      - blocked.example
  - tag: blocked-admin-port
    ipCidr:
      - 192.168.0.0/16
    port:
      - 23
```

If a rule in the file omits `outboundTag`, the `ruleSetFiles[].outboundTag` value is used. Rule-set paths are resolved relative to the main config file.

## Runtime Extensions

Dynamic plugin modules:

```json
{
  "plugins": {
    "modules": [
      { "tag": "local-plugin", "path": "./plugins/local-plugin.mjs", "enabled": true }
    ],
    "wasm": [
      { "tag": "matcher", "path": "./plugins/matcher.wasm", "enabled": true }
    ]
  }
}
```

Plugins are ESM modules that export either a plugin object or a factory function. They receive a context with inbound/outbound factory registration, logger, worker pool, and WASM extension access.

## Workers, Pool, QUIC, And Hot Reload

```json
{
  "workers": { "enabled": true, "size": 4, "taskTimeoutMs": 30000 },
  "connectionPool": { "enabled": true, "maxIdlePerEndpoint": 8, "idleTimeoutMs": 30000 },
  "transport": { "quic": { "enabled": true, "handshakeTimeoutMs": 10000 } },
  "hotReload": { "enabled": true, "debounceMs": 250 }
}
```

The worker pool is available to plugins and control-plane tasks. The connection pool is a bounded reusable TCP pool for safe control-plane use. QUIC currently exposes the transport interface and a clear unavailable error until a native or plugin implementation is registered. Hot reload watches the main config and rule-set files, then applies route/outbound/policy updates without restarting the process.
