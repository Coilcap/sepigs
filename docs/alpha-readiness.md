# v0.1.0-alpha Readiness

Status: ready for `v0.1.0-alpha` with documented experimental/unsupported boundaries. This is not a production-stable declaration.

## Startup Path

- README includes install, run, test, benchmark, and docs commands.
- `examples/sepigs.safe.json` is the recommended local-only starter config.
- `examples/sepigs.public-auth-required.json` is the public-listener example and must keep auth enabled.
- `npm run docs:check` validates example configs against the schema.

## Config Freeze Review

- JSON config is the stable alpha format.
- YAML is supported, but advanced ecosystem conversion remains experimental.
- Public unauthenticated HTTP/SOCKS listeners are rejected.
- Public metrics listeners are rejected.
- Future `configVersion` values are rejected.

## Experimental Or Reserved

- QUIC/Hysteria2 transport adapter.
- WireGuard packet transport.
- DoH/fake-ip advanced DNS strategy.
- Remote plugin stream transforms.
- External Shadowsocks/Trojan reference interoperability when local reference binaries are unavailable.
- GUI/mobile client verification until a human runs the generated configs.

## Release Gate

Required commands:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run benchmark
npm run soak:short
npm run soak:1h:full
npm run release:dry-run
npm run docs:check
```

Optional long soak:

```bash
npm run soak:6h:full
```

If the 6h run is interrupted, resume with:

```bash
npm run soak:resume -- --profile 6h --run-dir reports/soak/6h --docs-report docs/soak-6h-full-report.md
```

## Phase 7 Verification

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 65/65 tests.
- `npm run build`: passed.
- `npm run benchmark`: passed, 6,600/6,600 connections and zero tracked leaks after stop.
- `npm run soak:short`: passed, 19,040/19,040 operations.
- `npm run soak:1h:full`: passed, 456,990/456,990 operations, final tracked resources 0/0/0.
- `npm run release:dry-run`: passed, 311 release files.
- `npm run docs:check`: passed, 39 markdown files scanned.
- 6h profile: 10-minute substitute passed, 101,849/101,849 operations; full six-hour run remains pending.

Alpha blockers are closed. Production blockers remain the full 6h soak, GUI/mobile manual verification, external Shadowsocks/Trojan reference interoperability, native QUIC/Hysteria2, and WireGuard packet transport.
