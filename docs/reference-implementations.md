# Reference Implementations

Status: M2 pinned evidence harness active. Detection on 2026-07-01 found sing-box
1.13.14 and Xray 26.3.27; the other candidates remain missing. See
[external-compat-harness.md](external-compat-harness.md) and the generated
reports under `reports/compat/`.

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
2026-06-28. Detection captures the exact locally executed version on every run.

## Matrix

| Implementation | Candidate pin | Expected binary | Install method | Version command | License note | Planned supported tests | Explicitly unsupported in v0.3 M2 | Launcher status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| shadowsocks-rust | `v1.24.0` | `sslocal`, `ssserver` | `cargo install shadowsocks-rust --version 1.24.0` or official release artifact | `sslocal --version`; `ssserver --version` | GitHub metadata: MIT; verify pinned source | SS TCP inbound/outbound, three AEAD ciphers, wrong password, large payload | SS UDP certification, plugin transports, full CLI parity | generator ready; binary missing; 11 skipped |
| shadowsocks-libev | `v3.3.6` | `ss-local`, `ss-server` | Homebrew formula pinned by lock evidence or build official tag | `ss-local -h`; `ss-server -h`, retaining version banner | GitHub metadata: GPL-3.0; verify pinned source and distribution obligations | Independent SS TCP client/server cases, AEAD overlap, wrong password, large payload | Non-overlapping legacy ciphers, UDP certification, distro packaging parity | command generator ready; binaries missing; 11 skipped |
| sing-box | `v1.13.14` | `sing-box` | Pinned Homebrew bottle or official release artifact | `sing-box version` | GitHub metadata: NOASSERTION; manual pinned-tag license review required | SS and Trojan client/server roles, three AEAD ciphers, TLS/SNI, wrong password, 1 MiB payload, remote close, 8 concurrent streams | Unrelated protocols, TUN, QUIC/Hysteria2, configuration-dialect certification | M2 fingerprinted and verified locally; 23 verified, 1 unsupported |
| xray | `v26.3.27` | `xray` | Pinned Homebrew bottle or official release artifact | `xray version` | GitHub metadata: MPL-2.0; verify pinned source | SS and Trojan client/server, supported AEAD ciphers, TLS/SNI, wrong password, 1 MiB payload, remote close | VMess/VLESS certification, transport matrix, subscription compatibility | M2 fingerprinted and verified locally; 21 verified, 1 unsupported |
| trojan-go | `v0.10.6` | `trojan-go` | `go install github.com/p4gefau1t/trojan-go@v0.10.6` or official artifact | `trojan-go -version` with fallback to help/version banner | GitHub metadata: GPL-3.0; verify pinned source and maintenance status | Trojan TLS/SNI, wrong password, large payload, both implemented directions | Trojan-Go extensions, multiplexing/WebSocket certification, QUIC | generator ready; binary missing; 6 skipped |

## Launcher Contract

Each launcher must:

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

The immutable `v0.2.0-beta.0` release evidence remains 0 verified, 11 blocked,
and 0 failed. The later M1 run produced 23 verified, 28 skipped, 0 blocked,
0 failed, and 2 unsupported cases. These M1 results are development evidence
for v0.3.0 and do not retroactively alter the beta release.

The M2 matrix expands that development evidence to 44 verified, 28 skipped,
0 blocked, 0 failed, and 2 unsupported. Exact local file digests are retained
in `reference-fingerprints.json`; paths are represented with local-only
tokens. See [external-compat-version-pinning.md](external-compat-version-pinning.md).
