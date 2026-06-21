# 24-Hour Soak Infrastructure

The `soak:24h` profile supports checkpoint, resume, JSONL metrics, failure samples, connection dumps, and final report generation. A complete 24-hour Phase 8 run has not been executed.

The Phase 8 validation used the same runner with a 10-second duration override. Its results are recorded in [phase8-validation.md](phase8-validation.md); this does not count as a 24-hour pass.

```bash
npm run soak:24h
npm run soak:resume -- --run-dir reports/soak/24h
npm run soak:report -- --run-dir reports/soak/24h
```

Expected artifacts are under `reports/soak/24h/`.
