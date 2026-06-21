# Dashboard API

The management API is disabled by default and may only bind a non-public address. Enabling it requires a token of at least 16 characters.

```json
{"dashboard":{"enabled":true,"listen":"127.0.0.1","port":19091,"token":"replace-with-a-long-token","rateLimitPerMinute":120,"cors":false}}
```

Send `Authorization: Bearer <token>`. Endpoints: `GET /api/status`, `/api/connections`, `/api/metrics`, `/api/outbounds`, `/api/config`, `/api/logs`; `DELETE /api/connections/:id`; and `POST /api/reload`.

Configuration responses redact passwords, tokens, and keys. The token is never logged. Rate limiting is per source address and in memory. CORS is off by default. This is a local control plane, not an Internet-facing API.
