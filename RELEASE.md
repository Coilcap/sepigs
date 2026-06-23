# Release Process

1. Run `npm install`.
2. Run `npm run lint`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Run `npm run build`.
6. Run `npm run benchmark`.
7. Run `npm run benchmark:udp` and `npm run benchmark:gate`.
8. Run `npm run soak:short` on a host where a 10 minute local soak is acceptable.
9. Run `npm run soak:gate` before promoting the beta.
10. Run `npm run soak:1h:full` before a stable tag.
11. Run `npm run docs:check`, `npm run security:check`, and `npm run compat:external`.
12. Run `npm run verification:pack` and `npm run release:beta-dry-run`.
13. Review the soak, benchmark, compatibility, security, and release artifact reports.
14. Update `CHANGELOG.md`.

For v0.2.0-beta.0, also review `docs/v0.2.0-beta-readiness.md`, `release-notes-v0.2.0-beta.md`, and all acceptance rows under `verification/manual-pack/`.

Do not publish a release if socket/timer/listener counts fail to return to zero after stop.

If a 6h soak cannot be completed in the release environment, run:

```bash
SEPIGS_SOAK_DURATION=600000 npm run soak:6h:full
```

Then document the interruption reason and resume command in the release notes.
