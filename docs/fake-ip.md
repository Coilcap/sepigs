# Fake-IP DNS

Fake-IP is disabled by default. It maps domains into an IPv4 reservation without placing fake addresses in the real DNS cache.

```json
{"dns":{"fakeIp":{"enabled":true,"range":"198.18.0.0/15","size":65536,"ttlSeconds":600}}}
```

Mappings are bidirectional, TTL-bound, and LRU-limited. Requests targeting a known fake IP are restored to the original domain before routing and outbound DNS resolution. `persistPath` optionally writes mode-0600 JSON state using atomic rename. Use a private state path and do not share it between processes.

The current resolver API can allocate fake A answers, but sepigs does not yet expose a standalone DNS listener. TUN integration therefore remains experimental.
