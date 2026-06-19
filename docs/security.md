# Security

- Defaults listen on `127.0.0.1`.
- HTTP/SOCKS listeners bound to `0.0.0.0`, `::`, or `[::]` are rejected unless authentication is enabled.
- HTTP proxy supports optional Basic Auth.
- SOCKS5 supports optional username/password auth.
- Logs may include destination hostnames; use `warn` or `error` if metadata sensitivity matters.
- Plugin permissions are checked at API level. `in-process` plugins execute as local JS and must be trusted.
- `worker-thread` and `child-process` isolation modes contain crashes and enforce timeouts; child-process mode also sets a Node old-space limit.
- WASM modules run inside the Node WebAssembly runtime but can still consume CPU if exported functions are called without budget.
- DNS can leak queried domains to the configured resolver.
- DoH protects the DNS transport to the DoH endpoint, but the endpoint still sees queried names.
- Config files may contain credentials. Keep file permissions restricted to the service user.
- sepigs can become an open proxy if exposed without auth; the schema now rejects public unauthenticated HTTP/SOCKS listeners.
- Metrics default to `127.0.0.1`; public metrics listeners are rejected because metrics currently have no built-in authentication.
- Logs must not include passwords or tokens; current auth paths do not log credentials.

Not yet supported:

- mTLS or token auth.
- Per-user rate limits.
- Full OS-level sandbox profiles for plugins.
- Authenticated metrics endpoint.
