# Reference Implementations

Status: M0 strategy only. No binary is installed or launched by this document,
and no interoperability result is marked verified.

## Version And Trust Policy

- Use an exact release tag; never use an unpinned `latest`, branch head, or
  floating package version in a release gate.
- Record upstream repository, release URL, version output, artifact/binary
  SHA-256, install source, architecture, and license result.
- Prefer official release artifacts or the ecosystem's reproducible package
  manager. Do not run install scripts piped from the network.
- Bind reference processes to loopback and random ports, use ephemeral
  credentials, cap runtime/output, and terminate the complete process tree.
- Revalidate the license at the pinned tag. GitHub license metadata is a
  discovery hint, not legal approval.
- A detected binary remains `detected` until a vetted launcher proves startup,
  readiness, traffic assertions, and cleanup.

Candidate pins below were observed from official GitHub release metadata on
2026-06-28. M1 must recheck them before use.

## Matrix

| Implementation | Candidate pin | Expected binary | Install method | Version command | License note | Planned supported tests | Explicitly unsupported in v0.3 M1 | Launcher status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| shadowsocks-rust | `v1.24.0` | `sslocal`, `ssserver` | `cargo install shadowsocks-rust --version 1.24.0` or official release artifact | `sslocal --version`; `ssserver --version` | GitHub metadata: MIT; verify pinned source | SS TCP inbound/outbound, three AEAD ciphers, wrong password, large payload, remote close | SS UDP inbound certification, plugin transports, full CLI parity | planned; binary not currently detected |
| shadowsocks-libev | `v3.3.6` | `ss-local`, `ss-server` | Homebrew formula pinned by lock evidence or build official tag | `ss-local -h`; `ss-server -h`, retaining version banner | GitHub metadata: GPL-3.0; verify pinned source and distribution obligations | Independent SS TCP client/server cases, AEAD overlap, wrong password, large payload, remote close | Non-overlapping legacy ciphers, UDP inbound certification, distro packaging parity | planned; binary not currently detected |
| sing-box | `v1.13.14` | `sing-box` | Pinned Homebrew bottle or official release artifact | `sing-box version` | GitHub metadata: NOASSERTION; manual pinned-tag license review required | SS and Trojan client/server roles, cipher/TLS/SNI, wrong password, large payload, remote close | Unrelated sing-box protocols, TUN, QUIC/Hysteria2, configuration-dialect certification | planned; binary detected locally but no vetted launcher |
| xray | `v26.3.27` | `xray` | Pinned Homebrew bottle or official release artifact | `xray version` | GitHub metadata: MPL-2.0; verify pinned source | Independent Trojan TLS/SNI client/server cases; optional SS overlap where config is supported | VMess/VLESS certification, transport matrix, subscription compatibility | planned; binary detected locally but no vetted launcher |
| trojan-go | `v0.10.6` | `trojan-go` | `go install github.com/p4gefau1t/trojan-go@v0.10.6` or official artifact | `trojan-go -version` with fallback to help/version banner | GitHub metadata: GPL-3.0; verify pinned source and maintenance status | Trojan TLS/SNI, wrong password, large payload, remote close, both implemented directions | Trojan-Go extensions, multiplexing/WebSocket certification, QUIC | planned; binary not currently detected |

## Launcher Contract For M1

Each future launcher must:

1. Resolve and fingerprint the expected binary.
2. Reject an unapproved version or digest.
3. Generate redacted ephemeral config in an isolated directory.
4. Reserve a loopback random port without using a public listener.
5. Start one owned process group and wait for a bounded readiness signal.
6. Execute one named test case with explicit payload integrity assertions.
7. Capture bounded stdout/stderr and exit status.
8. Stop on success, failure, timeout, or signal.
9. Prove no child process, listener, credential file, or key remains.
10. Emit the record defined in `evidence-format.md`.

## Result Policy

- `verified`: external process ran and all assertions/cleanup passed.
- `failed`: external process ran and a product assertion failed.
- `blocked`: environment, dependency, privilege, or unsupported boundary
  prevented the assertion.
- `skipped`: case was not attempted.

Current release status remains 0 verified, 11 blocked, and 0 failed. Local
sing-box/xray detection does not change that status.

