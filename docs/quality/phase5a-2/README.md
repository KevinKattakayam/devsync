# Phase 5a-2: bounded blocker follow-up

Work is limited to security triage/runtime hardening and the existing shell visual failures. Lighthouse and local Compose/k6 measurements are deferred by the explicit half-scope timebox, not represented as passing or impossible in this environment. No Phase5c, push, real Clerk sign-in or deployment.

## Release blocker inventory at session start

The Phase5b progress entry names the Phase5a visual/pointer/scanner issues as blockers. The Phase5a entry and quality finding ledger identify:

1. Gitleaks: two history/current-tree matches; one synthetic test value and one incompletely classified capture in backend/.env.example.
2. Container vulnerabilities: only an April2026 cached image had been scanned (2 Critical/33 High); current-branch backend/frontend images were unmeasured. These are different images, not a before/after vulnerability comparison.
3. Dependency advisories: prior backend full tree41 Moderate/2 Low, production7 Moderate; frontend full tree16 Moderate, production0. Those prior npm numbers are not a new npm audit result.
4. Four shell visual cases: dark1440 commands-empty3337 differing pixels, dark390 commands3007, light1440 default7867, light390 default11719. Original tolerance0.002, unchanged.
5. Native Kanban pointer drag: no observed move PATCH in the broad browser run. Historical keyboard success does not close it.
6. Hosted Quality/security/E2E/coverage and operational rollout verification remain unexecuted. Known findings must continue blocking deployment; this session cannot substitute local commands for hosted success.

The ledger also retains unresolved security/operational work: versioned replacement of legacy cookie-clearing GET (C02), isolated/budgeted OCR/PDF parsing (E03), ambiguous remote embedding/AI billing settlement (G05/F02), production identity/infrastructure and durable billing webhook guarantees. These are not relabeled closed by scanner triage. See ../FINDINGS.md and ../../PROGRESS.md for the complete audit remainder.

## Secret-match classification

Default Gitleaks8.30.0 history scan:66 commits, two findings, scanner exit1. Raw capture values were compared in memory; only redacted reports and classification metadata were persisted. The example-file capture is exactly the following public variable name plus assignment operator, consumed after an empty assignment. Both actual Clerk assignments are empty. The test finding is the existing synthetic webhook value in a forbidden foreign-resource mutation test. Neither is a credential; no provider validation, credential rotation or history rewrite was performed.

`.gitleaks.toml` extends all default rules, with two exceptions each requiring the exact captured non-credential AND exact source-file path AND generic-api-key rule. No file, commit, directory or detection rule is excluded. A comment separates current example assignments. Five Docker-backed scanner regression cases pass: both known non-credentials are omitted, a generated new value in each excepted file is detected, and the synthetic fixture value in another source file is detected. Generated inputs are explicitly synthetic and temporary; their values are never emitted in evidence. See gitleaks-regression.json. Final history scan with reviewed exceptions:66 commits, zero findings, exit0. This does not prove absence of every secret or scan ignored private environment files.

## Current source image and filesystem scope

Initial images are the Phase5b clean-clone outputs from c7fa81a; app/Docker sources were unchanged by9cae1a0. Frontend is the local keyless/setup-guidance build, not a configured production Clerk bundle. Initial scans: backend1 Critical/42 High/114 Medium/86 Low/2 Unknown; frontend1 Critical/42 High/110 Medium/84 Low/2 Unknown. Both Debian12.15; these are package/advisory entries, not exploit counts. Raw reports are retained.

Ten High entries per image are in the global npm installation, not app runtime dependencies. Runtime stages now remove npm/npx/Yarn; Node starts applications and Prisma's CLI directly. Dependency/build/migration-tooling stages retain package managers. Final backend:1 Critical/32 High/102 Medium/85 Low/2 Unknown; final frontend:1 Critical/32 High/98 Medium/83 Low/2 Unknown. Ten High npm entries are removed per image. All remaining High/Critical entries are OS packages with no fixed version listed in this scanner database; they remain unresolved release blockers, not accepted risks or a maintainer waiver. The unchanged High/Critical gate will fail on these images. See scan-summary.json for exact package/ID/status and full raw JSON for vendor advisory metadata. Trivy commands exit0 to collect all severities; that collection exit is not a security-gate pass. No exploitability, reachability or absence of unpublished fixes is claimed. No application dependency override or untested distro migration is used to make a scan green.

The vulnerability-only filesystem scan excludes dependency trees, Git, .worktrees and generated quality/deployment evidence, but also discovers old locks under `.kilo/worktrees` and immutable docs/audit-evidence. Its aggregate132 High/14 Critical includes those historical locks; all146 High/Critical entries come from those stale worktree/audit targets. Current backend, frontend and isolated hosting SDK locks have zero High/Critical entries in this scan. Do not present the aggregate as current deployed dependency counts or delete old evidence to reduce it. This scan does not certify secrets, IaC or malicious-code absence.

## Security group gates

Both apps pass lint, format, strict types, tests and build. Backend28 suites/259 tests; frontend17 files/74 component tests plus the separate Node runner. Both changed Docker runner images build successfully. Workflow actionlint exits0 without diagnostics. Raw command output and per-gate exit/timing records are retained here. Scanner regression first lacked Docker socket access inside the sandbox; the authorized rerun passed. An initial history triage attempt used the wrong container user and returned no parseable report; no raw captures were exposed. The repository-owner scan succeeded. No fixture assertion, security threshold or test was removed or weakened.

Exception syntax follows [Gitleaks8.30.0 configuration documentation](https://github.com/gitleaks/gitleaks/blob/v8.30.0/README.md#configuration). The exact-match exceptions are reviewed false positives, not a scanner-wide pass claim.

## Visual follow-up and remaining scope

See [VISUAL_REVIEW.md](VISUAL_REVIEW.md) for each of the four image-triplet dispositions and actual failed runs. None is approved as an intentional baseline change. Final browser2 passed/4 failed(7.8m), with the original pixel counts unchanged. Seven reached shell axe reports show0 violations and5 incomplete rule occurrences; no all-state accessibility pass. The tested client renewal improvement passes76 frontend component tests but does not close those failures. No third cycle or baseline update.

Lighthouse and local Compose/k6 latency/editor-capacity execution were not attempted under the explicit half-scope timebox. These are deferred measurements, not zero scores or proof the environment cannot run them. Native pointer drag, OS security entries and earlier operational/audit deferrals remain unresolved. No hosted CI, live provider login, production load or deployment claim.

The final frontend renewal source was also built into `devsync-frontend:phase5a-2-renewal` and scanned once after that source change: 83 LOW, 32 HIGH, 98 MEDIUM, 2 UNKNOWN, 1 CRITICAL. Full raw output is frontend-renewal-final.json; the unchanged backend security-group image remains the final backend runtime source. Build/scan reports retain image identities; no changed image is represented by the stale April report.
