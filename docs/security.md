# Security

The v0.2.0 beta review and residual-risk decision are documented in [v0.2.0-security-review.md](v0.2.0-security-review.md). Run `npm run security:check` before packaging.

## Phase 8 Additions

- Dashboard is off by default, rejects public binds, requires a long Bearer token, rate limits requests, disables CORS, and redacts secrets.
- Fake-IP persistence uses mode `0600`; operators remain responsible for parent-directory permissions and stale state cleanup.
- Subscription input is parsed as data and never executed. Command output can contain credentials and should be redirected only to protected files.
- TUN, QUIC, and WireGuard adapters are experimental and disabled. Native privilege boundaries are not implemented.
- Shadowsocks and Trojan secrets remain plaintext in config. Trojan production deployment must enable TLS with protected key files.

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

## M1 External Compatibility Harness

- Reference processes bind only to `127.0.0.1` on randomly allocated ports.
- Configs, bounded raw logs, test certificates, and keys live under a
  sepigs-owned system temporary directory with restrictive file modes.
- The harness reads no user proxy config and uses fixed values explicitly
  named test-only; reports redact those values.
- Startup and stop deadlines are bounded. A timed-out process receives
  `SIGTERM`, then a process-group `SIGKILL` fallback, followed by a port-release
  check.
- Captured stdout/stderr is capped and report excerpts replace the system
  temporary path with `<system-temp>`.
- Temporary process artifacts are removed at teardown and are excluded from
  release packages. Small redacted summary reports under `reports/compat/`
  are the only retained evidence.
- External binaries remain third-party test dependencies. Detection and a
  successful version command do not grant trust or imply interoperability.
