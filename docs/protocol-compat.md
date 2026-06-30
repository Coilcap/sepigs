# Protocol Compatibility

## Evidence Generations

Local fixture tests remain useful for deterministic regression coverage, but
they are not external interoperability evidence. The immutable external
summary for `v0.2.0-beta.0` remains 0 verified, 11 blocked, and 0 failed
because that release had no vetted launcher.

M2 development evidence for v0.3.0 is separate: 44 verified, 28 skipped,
0 blocked, 0 failed, and 2 unsupported. The harness actually starts each
available reference process, checks payload integrity or expected rejection,
then verifies process and port cleanup.

```bash
npm run compat:detect
npm run compat:external:v1
npm run compat:report
```

See [external-compat-harness.md](external-compat-harness.md) for result
semantics and per-case reproduction.

## Shadowsocks

sepigs supports TCP inbound and outbound with `aes-128-gcm`, `aes-256-gcm`,
and `chacha20-ietf-poly1305`.

Local fixture evidence:

- sepigs outbound to a local encrypted reference fixture.
- All three supported AEAD ciphers.
- `test/compat/shadowsocks-compat.test.ts`.

External M2 evidence:

- sing-box 1.13.14 produced 15 verified Shadowsocks cases.
- Xray 26.3.27 produced 13 verified Shadowsocks cases.
- Both sepigs roles and all three AEAD ciphers were asserted.
- Outbound cases include 31-byte and 1 MiB payloads.
- Both directions include wrong-password rejection and remote close.
- sing-box includes an 8-connection concurrent case in both directions.
- shadowsocks-rust and shadowsocks-libev are missing; their 22 cases are
  skipped, not verified or failed.

Unsupported:

- Shadowsocks UDP inbound external certification.
- Plugin transports, legacy ciphers, and full reference CLI parity.

## Trojan

sepigs supports TCP inbound and outbound, password framing, TLS certificate
termination, certificate trust, and server-name configuration. Plain mode is
only a local fixture convenience.

Local fixture evidence:

- sepigs outbound to a local plain TCP fixture.
- Password hash line and TCP relay framing.
- `test/compat/trojan-compat.test.ts`.

External M2 evidence:

- sing-box 1.13.14 produced 8 verified Trojan TLS cases.
- Xray 26.3.27 produced 8 verified Trojan TLS cases.
- Both sepigs roles, wrong-password rejection, SNI/server-name handling,
  31-byte payloads, 1 MiB payloads, and remote close were asserted.
- The generated certificate is self-signed. sepigs outbound and sing-box
  client test paths disable chain validation; Xray client pins its fingerprint.
  This is not public-PKI certification.
- trojan-go is missing; its 6 cases are skipped, not verified or failed.

Unsupported:

- Public plain-mode interoperability.
- Trojan-Go extensions, WebSocket, multiplexing, and QUIC.

## Reports

Legacy fixture matrix:

- [protocol-matrix.json](../reports/compat/protocol-matrix.json)
- [protocol-matrix.md](../reports/compat/protocol-matrix.md)

M2 reference evidence:

- [reference-detection.json](../reports/compat/reference-detection.json)
- [reference-detection.md](../reports/compat/reference-detection.md)
- [external-v1.json](../reports/compat/external-v1.json)
- [external-v1.md](../reports/compat/external-v1.md)
- [external-summary-v1.json](../reports/compat/external-summary-v1.json)
- [external-summary-v1.md](../reports/compat/external-summary-v1.md)
- [reference-fingerprints.json](../reports/compat/reference-fingerprints.json)
- [sing-box-v0.3.0-m2.json](../reports/compat/sing-box-v0.3.0-m2.json)
- [xray-v0.3.0-m2.json](../reports/compat/xray-v0.3.0-m2.json)
- [gate-v0.3.0-m2.json](../reports/compat/gate-v0.3.0-m2.json)

To reproduce one M2 case:

```bash
npm run compat:external:v1 -- --case <case-id>
```

Do not mark a case verified without the reference version, payload assertion,
cleanup result, and redacted command/log evidence.
