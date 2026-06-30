# External Compatibility Gate

Run:

```bash
npm run compat:gate
```

The gate compares `external-v1.json` with
`baseline-v0.3.0-m2.json`.

It fails when:

- any case is `failed`;
- a blocked or skipped case has no reason;
- an unsupported case has no capability note;
- sing-box or Xray does not match its pinned version prefix;
- verified count drops by more than 20 percent.

Blocked, skipped, and unsupported remain non-verified states. They do not
directly fail the gate when properly explained, but enough missing verified
coverage still triggers the regression budget.

A baseline change requires a written `changeNote`, fresh fingerprints, a full
matrix run, and review. Never lower the baseline merely to make CI green.
