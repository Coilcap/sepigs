# Compatibility Evidence Pack

Generate:

```bash
npm run compat:evidence-pack
```

Output:

`artifacts/sepigs-v0.3.0-m2-compat-evidence.zip`

The archive contains redacted detection and fingerprint reports, sing-box and
Xray matrices, aggregate results, the M2 baseline and gate report,
reproduction commands, and a SHA-256 manifest.

It does not contain binaries, `node_modules`, temporary configs, generated
keys, raw unbounded logs, or real credentials. Source files are allowlisted
and audited before compression. `security:check` audits the finished archive
again when it is present.

The ZIP is evidence for the recorded host, versions, digests, and sepigs
commit. It is not a redistributable bundle of third-party software and does
not establish upstream binary trust by itself.
