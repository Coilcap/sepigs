# v0.2 Beta Maintenance Policy

Status: planning policy. There is no current requirement to publish
`v0.2.0-beta.1`.

## Support Boundary

The v0.2 beta line receives:

- Crash, hang, leak, and graceful-shutdown fixes.
- Authentication, exposure, secret-handling, and other security fixes.
- Regressions against signed HTTP, SOCKS5, UDP, DNS, fake-IP, Dashboard,
  routing, plugin, reload, and packaging behavior.
- Compatibility fixes required by verified P0 clients.
- Measured performance regression fixes.
- Test, documentation, CI, and release packaging corrections.

It does not receive:

- New protocols or new product features.
- v0.3 transactional reload architecture.
- Dashboard redesigns.
- TUN, QUIC/Hysteria2, or WireGuard work.
- Breaking config or dependency changes without a security necessity.

## Maintenance Branch Decision

No beta.1 release is needed now. Before the first v0.3 runtime change merges to
main, create `release/v0.2.x` from the immutable `v0.2.0-beta.0` tag. This
protects the beta baseline and provides a clean backport target. The branch may
exist without producing a release.

## beta.1 Triggers

Prepare `v0.2.0-beta.1` when at least one verified issue requires a shipped
artifact change:

- Authentication bypass, public-listener exposure, credential leak, unsafe
  plugin permission, or other material security defect.
- Reproducible process crash, deadlock, unbounded leak, or failed shutdown.
- 24-hour soak regression or final non-zero socket/timer/listener state.
- P0 Chrome/system, Mihomo, or Shadowrocket regression.
- Severe UDP, DNS, fake-IP, Dashboard, routing, or hot-reload corruption.
- Release package missing required files, containing a secret/local artifact,
  or failing to start on a supported Node.js runtime.
- CI/release workflow defect that requires repository or package changes for
  consumers to obtain a valid beta.
- External interoperability work finds a protocol bug in a v0.2 advertised
  path and the fix is narrow enough to backport.

## Non-Triggers

Do not create beta.1 solely for:

- Documentation wording with no consumer impact.
- New v0.3 capability or experimental prototype.
- A missing external reference binary or environment-only blocked result.
- A feature request, refactor preference, or benchmark improvement without a
  regression.
- A GUI/client issue that cannot be reproduced against sepigs.

## Severity And Response

| Severity | Example | Action |
| --- | --- | --- |
| Critical | Auth bypass, secret in artifact, remote crash on default path | Stop promotion, prepare private fix and beta.1 immediately after verification |
| High | Reproducible crash/leak, P0 client break, corrupt reload | Fix on maintenance branch and prepare beta.1 |
| Medium | Bounded compatibility or performance regression with workaround | Schedule beta.1 if multiple users are affected |
| Low | Documentation or diagnostic clarity | Fix on main; backport only when bundled with a required beta.1 |

## Fix Requirements

Every beta.1 fix requires:

- Reproduction against the published beta tag.
- Impact and affected configurations.
- A regression test or a documented reason why automation is impossible.
- Minimal patch with no feature work.
- Security, compatibility, benchmark, soak, or package validation appropriate
  to the defect.
- Forward-port to main.
- Bug-log entry and release note.

## beta.1 Release Gate

Before tagging:

- Lint, typecheck, tests, build, docs, and security checks pass.
- Relevant client/compatibility regression is re-signed.
- Benchmark and soak gates pass when runtime behavior changes.
- Beta package dry-run and artifact inspection pass.
- Tag target, notes, and changelog identify only maintenance changes.
- The existing `v0.2.0-beta.0` tag remains untouched.
- Release is marked prerelease, not latest, and not stable.

## End Of Maintenance

The v0.2 beta line remains available until v0.3 beta has passed equivalent or
stronger soak, client, compatibility, security, and release gates. Ending
maintenance requires an explicit announcement; it is not implied by starting
v0.3 development.

