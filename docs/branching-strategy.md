# Branching Strategy

Status: active M0 policy. `release/v0.2.x` was created and pushed from
`e14094d8eebcef18aeeeda96cffd4c43e61186c5`; `main` remains the v0.3
integration branch.

## Objectives

- Preserve the published `v0.2.0-beta.0` baseline.
- Keep v0.3 mainline changes reviewable and reversible.
- Prevent TUN, QUIC/Hysteria2, and WireGuard prototypes from entering release
  artifacts or claims.
- Make beta fixes easy to backport without moving an existing tag.

## Branch Roles

### `main`

- Integration branch for approved v0.3 P0/P1 work.
- Must remain buildable and pass required CI.
- Accepts additive, backward-compatible changes only.
- Does not accept P2 prototype dependencies or code paths.
- Does not change config version 1 during v0.3.

Allowed v0.3 work:

- M0 policy, evidence, baseline, and release-boundary work.
- M1 vetted external compatibility tooling and evidence.
- M2 transactional reload implementation after its design review.
- Dashboard API and minimal Web Dashboard beta-ready hardening.
- UDP, fake-IP, DNS, performance, test, security, and release hardening.

### `release/v0.2.x`

- Maintenance-only branch created during M0 before the first v0.3 runtime
  change merges to main.
- Receives only eligible bug, security, compatibility, performance regression,
  test, documentation, and packaging fixes.
- Must not receive v0.3 features, broad refactors, or config changes.
- Creation of the branch does not imply a beta.1 release.

Allowed:

- Bug fixes.
- Security fixes.
- Documentation fixes.
- Release metadata and packaging fixes.
- Compatibility evidence updates.
- Regression tests required by an eligible fix.

Forbidden:

- New protocols.
- New large Dashboard features.
- Breaking configuration changes.
- Experimental feature expansion.
- v0.3 runtime or architecture code.
- TUN, QUIC/Hysteria2, or WireGuard development.

### Short-Lived Feature Branches

Use `feature/v0.3-<scope>` for P0/P1 work. Each branch should:

- Address one acceptance unit.
- Include tests and failure injection with the implementation.
- Rebase or merge main frequently enough to expose conflicts early.
- Be deleted after merge.

Recommended initial scopes:

- `feature/v0.3-reference-launchers`
- `feature/v0.3-transactional-reload`
- `feature/v0.3-beta-pipeline`
- `feature/v0.3-udp-dns-stress`
- `feature/v0.3-dashboard-contract`
- `feature/v0.3-performance-baseline`

### Experimental Branches

Use long-lived, explicitly non-release branches:

- `exp/v0.3-tun-native`
- `exp/v0.3-quic-research`
- `exp/v0.3-wireguard-adapter`
- `exp/v0.3-ruleset`
- `exp/v0.3-subscription-provider`

Rules:

- Do not merge these branches into main during normal v0.3 development.
- Do not include their dependencies or artifacts in main packages.
- Rebase from main; never merge experimental history back wholesale.
- Promotion requires a focused RFC, threat model, acceptance evidence, and a
  new short-lived feature branch containing only the reviewed subset.

## Pull Request Gates

Every main or maintenance pull request requires:

- Explicit scope and target branch.
- Regression/acceptance criteria linked in the description.
- Lint, typecheck, tests, build, documentation, and security checks.
- Compatibility, benchmark, soak, or package checks when the touched area
  requires them.
- No secret, absolute-path, generated-report, profile, or large-binary drift.
- Reality-check update when a capability classification changes.

Transactional reload and external launcher changes require at least one review
focused on failure cleanup and evidence integrity.

## Backport Flow

1. Confirm the defect meets the maintenance policy.
2. Add a minimal regression test on the affected line.
3. Apply the smallest fix to `release/v0.2.x`.
4. Verify the complete beta maintenance gate.
5. Forward-port the fix and test to main.
6. Record both commits in the bug log.

If the fix depends on v0.3 architecture, redesign a smaller v0.2 fix or defer
with a documented mitigation. Do not backport the architecture.

Do not publish `v0.2.0-beta.1` directly from main. A required beta.1 fix must
land on `release/v0.2.x`, pass maintenance gates there, and then be
forward-ported to main.

## Tag Rules

- Never move, recreate, or force-update `v0.2.0-beta.0`.
- beta.1, v0.3 alpha, beta, and RC tags are created only from a clean,
  validated release commit.
- Tags are annotated and pushed once.
- A failed publication is corrected with a new prerelease tag, not a moved
  tag.
- No stable tag is created automatically from a prerelease milestone.

## Merge Order

1. Maintenance policy and evidence format.
2. Reference launcher infrastructure and compatibility matrix.
3. Transactional reload.
4. UDP/DNS/fake-IP stress and Dashboard contract.
5. Performance baseline and beta closure.

P2 work proceeds independently and cannot block mainline v0.3 delivery.
