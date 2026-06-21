# Release Process

1. Run `npm install`.
2. Run `npm run lint`.
3. Run `npm run typecheck`.
4. Run `npm test`.
5. Run `npm run build`.
6. Run `npm run benchmark`.
7. Run `npm run soak:short` on a host where a 10 minute local soak is acceptable.
8. Run `npm run soak:1h:full` before tagging an alpha.
9. Run `npm run docs:check`.
10. Run `npm run release:dry-run`.
11. Review `docs/soak-report.md`, `docs/soak-full-report.md`, `bench/results/latest.md`, `reports/compat/protocol-matrix.md`, and profiling outputs if generated.
12. Update `CHANGELOG.md`.

For RC1, also review `docs/beta-readiness.md`, `release-notes.md`, and all acceptance rows under `verification/`.

Do not publish a release if socket/timer/listener counts fail to return to zero after stop.

If a 6h soak cannot be completed in the release environment, run:

```bash
SEPIGS_SOAK_DURATION=600000 npm run soak:6h:full
```

Then document the interruption reason and resume command in the release notes.
