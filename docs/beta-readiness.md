# Beta Readiness

Target: `v0.1.0-rc1` for controlled beta distribution. This is not a production-stable release.

## Automated Tests

- [x] Strict TypeScript build and typecheck.
- [x] ESLint static analysis.
- [x] Unit, integration, protocol fixture, fault-injection, plugin isolation, security, metrics, and soak-clock tests.
- [x] HTTP CONNECT and SOCKS5 CONNECT end-to-end paths.
- [x] Authentication success/failure and public-listener rejection.
- [x] Inbound reload rollback, plugin crash containment, and timeout recovery.

## Documentation

- [x] README startup path.
- [x] Config, architecture, security, alerts, observability, plugin RPC, compatibility, and soak documentation.
- [x] Technical debt audit and Reality Check v2.
- [x] RC1 release notes and upgrade guidance.
- [x] `npm run docs:check` validates npm scripts, local links, and sepigs example configs.

## Example Configurations

- [x] Safe localhost configuration parses.
- [x] Public listener example requires authentication.
- [x] Mihomo and Stash YAML parse locally.
- [x] Surge static sections validate locally.
- [x] Shadowrocket, NekoBox, and v2rayN have reproducible manual import instructions.
- [ ] Real GUI/mobile acceptance rows must be signed in `verification/`.

## Alerts

- [x] Active connection threshold.
- [x] Connection error rate.
- [x] DNS failure rate.
- [x] Hot reload failure.
- [x] Event-loop delay.
- [x] RSS memory threshold.
- [x] Outbound failure spike.
- [x] Missing metrics scrape.
- [x] Alert expressions reference metrics emitted by sepigs.

## Metrics

- [x] Uptime, connection totals/active/failures.
- [x] Upload/download bytes and route matches.
- [x] Outbound and DNS failures.
- [x] Hot reload attempts/failures.
- [x] Event-loop delay, heap, RSS, sockets, timers, and listeners.
- [x] GC event count and duration.
- [x] Metrics bind to localhost by default and do not expose credentials.

## Soak And Release

- [x] 10-minute short soak completed.
- [x] Clean 1-hour full soak completed with zero errors and zero retained resources.
- [x] 6-hour profile received a 10-minute infrastructure validation.
- [x] 24-hour runner, checkpoint, resume, JSONL metrics, summaries, and final report paths are implemented.
- [ ] Full 24-hour soak has not been executed.
- [x] Release dry-run excludes tests, node_modules, profiles, and local checkpoint files.

## Decision

The core is beta-ready for controlled testers. RC1 publication is conditional on review of this checklist; broad production use remains blocked by unsigned real-client acceptance rows, the unexecuted 24-hour soak, and external Shadowsocks/Trojan implementation testing.

## RC1 Verification Result

- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: passed, 66/66 tests.
- `npm run docs:check`: passed, 49 markdown files scanned.
- `npm run release:dry-run`: passed, 325 release files including RC1 notes and all verification worksheets.
- Client config validation: Mihomo/Stash YAML parsed; Surge static validation passed; external client binaries remain unavailable.
- `npm run soak:24h` infrastructure smoke: 228/228 operations over 3 seconds, zero errors, output isolated under `/tmp`.
- Full 24-hour execution: not run.
