# External Compatibility Harness

The M2 harness detects and fingerprints supported reference binaries, generates isolated
loopback-only configs, owns their process lifecycle, exchanges real payloads,
and writes redacted evidence. It does not install software or convert missing
dependencies into successful results.

## Commands

```bash
npm run compat:detect
npm run compat:fingerprint
npm run compat:external:v1
npm run compat:report
npm run compat:gate
npm run compat:evidence-pack
```

Run one case with:

```bash
npm run compat:external:v1 -- --case <case-id>
```

Case IDs and exact reproduction commands are listed in
`reports/compat/external-v1.md`.

`compat:detect` writes binary paths, executable status, version commands,
version output, platform, architecture, and install hints. `compat:external:v1`
runs all cases whose binaries are available. `compat:report` combines both
reports without rerunning traffic.

## Optional Installation

Install only from a source you trust and pin the intended version:

```bash
cargo install shadowsocks-rust --version 1.24.0
brew install shadowsocks-libev
brew install sing-box
brew install xray
go install github.com/p4gefau1t/trojan-go@v0.10.6
```

Installation is never performed by the harness. Re-run `compat:detect` after
changing `PATH`.

## Result Semantics

- `verified`: the named external binary started, became ready, exchanged or
  rejected the expected payload, stopped, and released its port.
- `failed`: the external process ran but a traffic or cleanup assertion failed.
- `blocked`: a present dependency or environment prevented the assertion.
- `skipped`: the required binary was not available, so the case did not run.
- `unsupported`: the case is outside the declared sepigs or harness boundary.

Only `verified` is a positive interoperability claim. Detection, local mocks,
blocked cases, and skipped cases are not substitutes.

## Current M2 Matrix

The 2026-07-01 Darwin arm64 run found sing-box 1.13.14 and Xray 26.3.27:

| Reference | Verified | Failed | Blocked | Skipped | Unsupported |
| --- | ---: | ---: | ---: | ---: | ---: |
| shadowsocks-rust | 0 | 0 | 0 | 11 | 0 |
| shadowsocks-libev | 0 | 0 | 0 | 11 | 0 |
| sing-box | 23 | 0 | 0 | 0 | 1 |
| xray | 21 | 0 | 0 | 0 | 1 |
| trojan-go | 0 | 0 | 0 | 6 | 0 |
| **Total** | **44** | **0** | **0** | **28** | **2** |

Shadowsocks coverage includes both sepigs roles, all three supported AEAD
ciphers, 31-byte and 1 MiB payloads where defined, wrong-password rejection,
remote close, and sing-box 8-connection concurrency. Trojan coverage includes
both sepigs roles over local TLS, 31-byte and 1 MiB payloads,
SNI/server-name behavior, wrong-password rejection, and remote close.

## Trojan Boundary

External Trojan cases use ephemeral local TLS certificates. sepigs outbound
sends the `localhost` server name but disables chain validation for this
self-signed test certificate; this proves encrypted protocol interoperability,
not public-PKI verification. Xray client cases pin the generated certificate
fingerprint. Sing-box client cases use its explicit insecure test setting. The
large Xray client case confirms a small exchange before the 1 MiB transfer so
the payload is measured over an established tunnel.

Plain Trojan mode remains a local fixture convenience. It is not eligible for
public interoperability verification. Trojan-Go extensions, WebSocket,
multiplexing, and QUIC are outside M2.

## Lifecycle And Artifacts

All listeners use `127.0.0.1` and random high ports. Temporary configs and
keys use restrictive permissions in the system temporary directory. Output is
bounded, test secrets and temporary paths are redacted, and teardown removes
the run directory. A startup timeout terminates the owned process group and
checks that its ports closed.

Retained reports:

- `reports/compat/reference-detection.json`
- `reports/compat/reference-detection.md`
- `reports/compat/reference-fingerprints.json`
- `reports/compat/reference-fingerprints.md`
- `reports/compat/external-v1.json`
- `reports/compat/external-v1.md`
- `reports/compat/external-summary-v1.json`
- `reports/compat/external-summary-v1.md`
- `reports/compat/sing-box-v0.3.0-m2.json`
- `reports/compat/xray-v0.3.0-m2.json`
- `reports/compat/gate-v0.3.0-m2.json`

The ZIP evidence pack contains only these redacted text reports, a manifest,
and reproduction commands. It never includes external binaries or temporary
configs.
