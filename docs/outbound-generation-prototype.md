# Outbound Generation Prototype M10

Status: implemented pure-data prototype. No outbound runtime integration.

## Scope

M10 adds:

- immutable outbound generation descriptors and entries;
- risk/capability/dependency classification;
- generation builder and structural diff;
- validator with redacted findings;
- outbound-only dry-run;
- outbound-only shadow reference simulation;
- report security checks.

M10 does not import or invoke the production outbound registry from its
generation, builder, validator, dry-run, or shadow modules. It does not create
an `Outbound`, call `connect()`, open a socket/listener, replace
`Engine.outbounds`, stop an outbound, close a connection, or mutate
Router/Policy, DNS, fake-IP, inbound, UDP, plugins, or connection-manager.

The runtime allow-list remains:

- `metrics`;
- `dashboard`;
- `router`;
- `policy`;
- `dns`.

## Generation Model

`OutboundGeneration` contains:

- ID, keyed config hash, creation time, state, and parent generation ID;
- read-only registry snapshot and ordered tag/type summaries;
- policy binding and health snapshots copied by value;
- immutable entries with keyed config hash, capabilities, risk,
  experimental marker, and dependencies;
- a private usage marker used only by shadow simulation.

The snapshot stores redacted config data, never live outbound instances.
Passwords, tokens, private keys, and pre-shared keys become `[REDACTED]`.
Hashes use a process-local random HMAC key and are not comparable across
processes.

Risk classification:

| Type | Risk | M11 candidate |
| --- | --- | --- |
| direct | low | yes |
| block | low | yes |
| TCP relay | low | yes |
| Shadowsocks | medium | no |
| Trojan | medium | no |
| WireGuard/plugin/unknown experimental type | high | no |

## Builder And Diff

The builder consumes current config snapshots, candidate `SepigsConfig`,
current policy/health snapshots, and optional active-reference tags. It builds
one isolated candidate generation.

Diff output includes:

- added and removed tags;
- rename as remove plus add;
- modified fields;
- type and target changes;
- secret identity changes rendered only as `[REDACTED]`;
- policy/default references;
- missing policy references.

The builder never resolves DNS, constructs a transport, calls a registry
factory, or sends a health probe.

## Validator

Validation covers:

- unique/non-empty tags;
- known prototype types and experimental opt-in;
- default and policy references;
- direct/block unexpected fields;
- TCP relay target host/port;
- supported Shadowsocks cipher and non-empty password;
- Trojan target, password, and serverName rules;
- removed outbound references held by active policy/connection simulation.

Output separates errors, warnings, bounded risk summary, restart requirement,
and unsupported changes. Error messages contain tag/type/field identity only,
not secret values.

## Dry-Run

Run:

```bash
npm run outbound:dry-run -- --config examples/sepigs.safe.json
```

Outputs:

- `reports/outbound/dry-run-latest.json`;
- `reports/outbound/dry-run-latest.md`.

The report includes current/candidate summaries, diff, validation findings,
risk, unsupported changes, and an M11 limited-runtime assessment. Absolute
paths outside the repository become `<external-config>`.

Before returning, the report generator extracts credential values from both
configs and scans its serialized output for exact JSON string values. A leak
fails report generation. The report records a redaction proof and zero runtime
side effects.

## Shadow

Run:

```bash
npm run outbound:shadow -- --config examples/sepigs.safe.json
```

Outputs:

- `reports/outbound/shadow-latest.json`;
- `reports/outbound/shadow-latest.md`.

Shadow acquires an old generation usage marker, builds a candidate, simulates
the old selection retaining its generation and a new selection using the
candidate, then releases both markers. A removed active tag produces a
draining warning. A missing candidate policy target rejects the simulation.

This is not an Engine reload and publishes no generation.

## Security Boundary

`security:check` scans outbound reports for:

- local absolute paths;
- private-key material;
- unredacted password/token/privateKey fields;
- missing or failed redaction proof.

Release packaging already excludes the complete `reports/` tree, profiles,
tests, and temporary artifacts.

## Test Evidence

M10 adds focused tests for:

- immutable generation/entries and private usage references;
- duplicate tag and parent linkage;
- rename, type, target, and secret diff;
- low/medium/high risk;
- health snapshots copied by value;
- validator fields, policies, experimental opt-in, and redaction;
- factory non-invocation;
- dry-run side effects, path handling, and M11 assessment;
- shadow old/new references, missing targets, active removal warning, and zero
  runtime/network mutation.

The full project suite, compatibility gate, docs, security, and existing reload
dry-run/shadow remain mandatory.

## Known Limits

- Generation state transitions are modeled but not connected to Engine.
- Usage markers are simulation-only and not connected to `ManagedConnection`.
- Health is snapshotted; no ActiveProber lifecycle is owned.
- The prototype validates parsed config, not raw unknown fields removed by the
  config loader.
- M11 composite Router/Policy/Outbound publication, rollback, draining, metrics,
  runtime smoke, and soak are not implemented.
- Shadowsocks/Trojan runtime reload remains deferred until M13 compatibility
  admission.
