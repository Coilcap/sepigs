# External Compatibility Version Pinning

M2 evidence is valid only for the exact reference version and local file
fingerprint recorded by the run.

## Current Pins

| Implementation | Status | Version |
| --- | --- | --- |
| sing-box | verified and fingerprinted | 1.13.14 |
| Xray | verified and fingerprinted | 26.3.27 |
| shadowsocks-rust | missing | not verified |
| shadowsocks-libev | missing | not verified |
| Trojan-Go | missing | not verified |

Run:

```bash
npm run compat:detect
npm run compat:fingerprint
npm run compat:external:v1
npm run compat:report
npm run compat:gate
```

`reference-fingerprints.json` records version output, SHA-256, size, mtime,
platform, architecture, redacted entry path, resolved symlink path, source
classification, and trust note. When a package-manager entry is a wrapper, the
report also fingerprints its resolved execution target. These digests identify
local files; they do not replace upstream release-signature or package-manager
provenance review.

## Version Changes

Do not merge results from different versions into one verified count. After
any upgrade:

1. Save the old detection, fingerprint, and matrix as one evidence set.
2. Run the complete command sequence with the new binary.
3. Investigate every changed result and log excerpt.
4. Update the baseline only with a written `changeNote` and review.
5. Generate a new evidence pack.

Homebrew can upgrade dependencies during unrelated operations. Before a gate,
compare `brew list --versions sing-box xray`, version output, and SHA-256 with
the baseline. Use a versioned formula or retained bottle only under the
operator's package policy; do not silently accept a new digest.
