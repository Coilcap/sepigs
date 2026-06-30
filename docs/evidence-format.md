# Evidence Format

Status: active M0 standard.

Evidence records separate user statements, local fixtures, external reference
runs, and release automation. A `verified` result must identify the actor,
environment, sepigs commit, inputs, assertions, and retained output. Missing
metadata is written as `unknown`; it is never inferred.

## Common Envelope

Every record contains:

| Field | Requirement |
| --- | --- |
| `evidenceId` | Stable unique ID, such as `client-mihomo-20260628-01` |
| `kind` | `client`, `protocol`, `soak`, or `release` |
| `result` | `verified`, `failed`, `blocked`, `skipped`, or `unsupported` |
| `startedAt` / `completedAt` | UTC ISO-8601 timestamps |
| `sepigsCommit` | Full Git commit hash |
| `environment` | OS, architecture, Node.js version, and relevant limits |
| `signer` | Person, CI workflow, or automation identity |
| `notes` | Concise limitations and deviations |
| `artifacts` | Repository-relative paths plus SHA-256 where retained |

`blocked` means an attempted validation could not reach the product assertion
because of an environment/dependency boundary. `skipped` means it was not
attempted. `unsupported` means the case is outside the declared product or
harness capability boundary. None is equivalent to `verified`.

Commands and logs must redact passwords, tokens, private keys, subscription
URLs, user paths, and unrelated environment variables. Release artifacts must
not contain temporary credentials or absolute local paths.

## Client Signoff Evidence

Required fields:

| Field | Description |
| --- | --- |
| `clientName` | Product name |
| `clientVersion` | Exact version or `unknown` |
| `os` | OS name/version or `unknown` |
| `device` | Device/model or `unknown` |
| `sepigsCommit` | Full tested commit |
| `configFile` | Repository-relative config/worksheet path |
| `testUrls` | Exact non-secret URLs |
| `checks` | HTTP, HTTPS, SOCKS5, auth, DNS, reconnect, and rollback results |
| `result` | Overall result |
| `logsOrNotes` | Redacted artifact paths, screenshot descriptions, or notes |
| `signer` | Person or automation identity |
| `date` | UTC date/time |

User-only confirmation is valid manual signoff when explicitly attributed to
the user. Fields not supplied by the user remain `unknown`.

## External Protocol Evidence

Required fields:

| Field | Description |
| --- | --- |
| `referenceImplementation` | shadowsocks-rust, shadowsocks-libev, sing-box, xray, or trojan-go |
| `referenceVersion` | Exact reported version |
| `binaryPath` | Resolved executable path without user-home disclosure |
| `binaryDigest` | SHA-256 of the executed binary or release artifact |
| `launchCommand` | Redacted, reproducible command and config |
| `sepigsRole` | inbound/server or outbound/client |
| `referenceRole` | client or server |
| `cipherOrProtocol` | Cipher, TLS/SNI mode, and transport |
| `payloadSize` | Exact byte count and integrity method |
| `result` | Overall and per-assertion result |
| `logs` | Redacted stdout/stderr and packet/application assertions |
| `reproductionCommand` | One bounded command to rerun the case |
| `cleanup` | Child processes, sockets, timers, files, and exit status |

A reference case is verified only when the expected external binary actually
started, reached ready state, exchanged the asserted payload, and cleaned up.
A local mock or binary detection alone cannot satisfy this record.

The M2 JSON record maps these fields as follows: `caseId`,
`referenceImplementation`, `referenceVersion`, `sepigsRole`, `protocol`,
optional `cipher`, `payloadSize`, optional concurrency, redacted `command`, `result`, `reason`,
bounded stdout/stderr excerpts, `reproductionCommand`, logical
`artifactPath`, process-cleanup status, and timestamps. Binary path,
version-command, and SHA-256 evidence live in the companion detection and
fingerprint reports. Raw temporary configs, logs, certificates, and keys are
deleted after the bounded run and are not release artifacts.

## Soak Evidence

Required fields:

| Field | Description |
| --- | --- |
| `profile` | Scenario/profile identifier |
| `duration` | Effective and wall-clock duration |
| `successCount` | Successful measured operations |
| `errorCount` | Product errors, separated from infrastructure pauses |
| `errorRate` | `errors / (successes + errors)` |
| `latency` | p50, p95, and p99 in milliseconds |
| `memory` | RSS/heap min, p50, p95, max, final, and trend conclusion |
| `eventLoop` | Event-loop delay percentiles |
| `finalResources` | Sockets, timers, listeners, connections, and child processes |
| `reportPath` | Repository-relative final report path |
| `runDirectory` | Ignored raw evidence directory |
| `sepigsCommit` | Full tested commit |
| `resumeHistory` | Checkpoint IDs, interruptions, and excluded suspension time |

Pass/fail must be computed from the profile criteria. A partial run is
`blocked` or `incomplete`, never a full-duration pass.

## Release Evidence

Required fields:

| Field | Description |
| --- | --- |
| `tag` | Exact immutable tag |
| `targetCommit` | Fully resolved tag target |
| `ciRuns` | Workflow name, run ID, URL, head SHA, and conclusion |
| `releaseUrl` | Published or draft URL |
| `releaseState` | Draft/prerelease/stable/latest booleans |
| `artifacts` | Name, size, SHA-256, and content type |
| `checks` | Docs, security, test, build, benchmark, soak, and package results |
| `sourceTree` | Branch, commit, and clean/dirty state |

Tag object hash and target hash are recorded separately for annotated tags.
Publication evidence must confirm the release is bound to the intended tag and
must not claim stable/latest status from a prerelease.

## Storage And Review

- Human-readable summaries live under `docs/` or `verification/`.
- Machine-readable reports live under `reports/` when they are small,
  redacted, deterministic, and approved for Git.
- Raw logs, profiles, checkpoints, temporary configs, and generated keys stay
  in ignored run directories.
- Every promoted capability links to its evidence record and acceptance
  criterion.
- Evidence changes receive the same review as code when they alter a release
  claim.
