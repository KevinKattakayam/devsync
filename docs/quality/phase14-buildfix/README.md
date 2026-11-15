# Phase 14 — Next.js production-build failure and Gitleaks triage

## Verdict

The apparent production-build failure was an execution-sandbox failure. No source, Next.js configuration, TypeScript configuration, dependency, or build behavior needed changing. The same build succeeds when child-process creation is allowed. The local safe correction is to run the frontend gate in the normal CI-equivalent process context rather than treating a restricted sandbox failure as a product build failure.

## Build investigation

Environment reviewed: Node `v22.23.2`, Next `16.4.3`, TypeScript `5.9.3`, `frontend/next.config.ts`, `frontend/tsconfig.json`, and Next's installed `dist/lib/typescript/runTypeScriptCli.js`. The Next helper invokes the resolved TypeScript CLI with `--showConfig --project tsconfig.json --pretty false`, captures stdout, and parses that capture as JSON.

Restricted-context reproduction:

- `cd frontend && npm run build -- --webpack` — **exit 1**, exact message: `Could not parse output from TypeScript's --showConfig.`
- A minimal Node `spawnSync` probe for the same TypeScript CLI returns `{status: 0, errorCode: "EPERM", stdoutBytes: 0, stderrBytes: 0}`. The restricted runner denied the child process, while its wrapper presented an empty, nominally successful result to the parser. Direct `tsc --showConfig` from the shell is not subject to that Node-child-process restriction and emits valid JSON.
- With child-process creation permitted, the same probe returns `{status: 0, errorCode: null, stdoutBytes: 8926, validJson: true}`. `npm run build -- --webpack` then **exits 0** and completes compile, TypeScript validation, static generation and route collection.

The sanitized failure capture is `sandbox-build-failure.txt`; `child-process-probes.json` preserves both probe outcomes.

The error is therefore not caused by invalid project JSON, TypeScript incompatibility, a Next regression, missing build environment keys, or modified application code. No speculative upgrade, `skipTypeCheck`, parser bypass, or build gate change was introduced. A software regression test is not appropriate for an external sandbox permission; the deterministic pair of child-process probes and the real production build are retained here instead. The original focused Kanban UI changes remain in `bc7701a`.

## Full frontend gate

`python3 tools/quality/gates.py frontend docs/quality/phase14-buildfix` was run with child-process permission enabled. All prescribed gates exited 0:

| Gate                                                          |                                                Result |
| ------------------------------------------------------------- | ----------------------------------------------------: |
| Lint                                                          |                                                     0 |
| Formatting                                                    |                                                     0 |
| Strict types                                                  |                                                     0 |
| Tests                                                         | 0 — 9 Node tests, 34 component-test files / 156 tests |
| Production build (`next build --webpack`)                     |                                                     0 |
| Coverage comparison against `tools/ci/coverage-baseline.json` |                                                     0 |

Collected coverage: 55.38% statements, 48.59% branches, 50.12% functions, 56.73% lines. `node tools/ci/coverage.mjs frontend docs/quality/phase14-buildfix/frontend-coverage/coverage-summary.json tools/ci/coverage-baseline.json` passes; thresholds were not changed. Unedited gate logs are preserved in `frontend-gate-logs.tar.gz`; the machine-readable results are retained in this directory.

## Sanitized Gitleaks triage

The pinned all-history Gitleaks scan reports exactly one `generic-api-key` match: `docs/PROGRESS.md`, line 5, commit `88d10175c7eb5f49a054094a819749be26ce146c`. Inspection was performed in a sanitizing script that replaced the matched span before emitting context. The span is ordinary multiword documentation prose summarizing API-schema and package-vulnerability checks, not a credential-shaped token or secret assignment. Triage: **false positive**. No matched value is included in this record or its attached report.

The complete historical scan still exits 1 because the scanner includes all history, and its effective configuration currently has no exception for this phrase. The seven-case `gitleaks-regression.py` test passes. No history rewriting, credential rotation, or scanner exception was performed. Recommended action: have the security owner approve a narrowly scoped exception for this exact prose finding (with a regression case proving generated credential-like values remain detectable), or approve an alternate historic-scan policy. Do not add a broad path/rule allowlist.

The retained `gitleaks-redacted.json` contains only redacted secret/match fields. Scan result: one finding, same path/commit/line; exit 1. No credential was identified by this finding, though this result is not a general proof that the repository contains no credentials.

## Paths and deferred Phase 14 work

- Gate outputs, coverage summary, scanner regression output and redacted Gitleaks history report: this directory.
- Phase status updates: `docs/PROGRESS.md` and `CHANGELOG.md`.
- The broader premium UI phase remains incomplete: the remaining dashboard, editor, connected-work detail, inbox, AI sheet, settings, responsive states, manual accessibility review and remaining error/empty/offline states are not covered by this build-fix increment. No Phase 15 work started.
