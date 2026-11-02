# Security policy

DevSync remains under development. The latest recorded images have0 Critical and44 High entries each; those High entries are accepted only under documented runtime conditions, not suppressed or automatically waived by CI. Read the [inventory](docs/quality/phase5a-3/VULNERABILITIES.md), [final report](docs/FINAL_REPORT.md) and [current progress](docs/PROGRESS.md) before deploying. No supported-version SLA, penetration-test certification or production approval is asserted.

## Private reporting

Do not put credentials, workspace content or exploit details in public issues. If GitHub offers **Security → Report a vulnerability**, use it; otherwise establish a trusted private maintainer channel before sending sensitive material. No dedicated security email, response-time commitment, bug bounty or verified configured private reporting channel is supplied here.

Include the affected revision, prerequisites, minimal synthetic reproduction, expected/observed behavior and redacted request IDs. Do not access another person's workspace or test infrastructure you do not own. Keep tokens, prompts, database/Redis URLs, browser storage-state files and dumps out of logs/screenshots/tickets. Discuss disclosure and notification timing privately with maintainers and relevant legal/security owners.

## Implemented controls and their limits

| Boundary                  | Source-backed control                                                                                                                            | Limitation                                                                                                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Identity                  | Clerk verification plus local active-principal checks; isolated test strategy only in testing server                                             | Provider methods/session/MFA policy and real sign-in require account setup. No custom password/session administration product.                                                 |
| Workspace/resource access | Current role/membership/suspension policy, transactional checks and tenant RLS                                                                   | Runtime credentials must be non-owner/NOBYPASSRLS; privileged operators are outside that boundary. See [AUTHZ_MATRIX](docs/AUTHZ_MATRIX.md) for service/SCIM/admin exceptions. |
| Collaboration             | Server viewer read-only, bounded updates, journal-before-ack, scoped rooms, repeated-token renewal and current authority checks                  | Unsent edits, background timers, restored grants and already-rendered/local copies have distinct limits. No remote wipe or complete offline product.                           |
| AI                        | Atomic request/concurrency admission, bounded input/output/time, constrained configured fallback and untrusted-source treatment                  | Not exact monetary settlement, injection-proofing or factual-support certification; provider processing/terms need review.                                                     |
| Repository secrets        | AES-256-GCM enc:v1 envelope with explicit16-byte tags                                                                                            | Legacy plaintext compatibility and no keyring/automated rotation; this is not document end-to-end encryption.                                                                  |
| Runtime                   | Pinned non-root multi-stage images; local application services drop capabilities and use no-new-privileges; unused mount/nsenter/infocmp removed | High OS findings remain reported. Equivalent host controls are not verified by Docker USER alone.                                                                              |
| Supply chain              | Required CI definitions, coverage-drop comparison, scans and reviewed manual deployment workflows                                                | Hosted checks were not run here; unchanged High gate still blocks remaining findings. Known exact non-credential Gitleaks exceptions have detection regressions.               |

Sources: [workspace policy](backend/src/security/workspace-policy.ts), [tenant client](backend/src/lib/tenant-prisma.ts), [collaboration](backend/src/services/collaboration-server.ts), [AI policy](docs/AI_COST_SAFETY.md), [encryption](backend/src/services/secret.service.ts), [Compose](docker-compose.yml), [workflows](.github/workflows).

Open issues include legacy cookie-clearing GET/CSRF migration, OCR/PDF isolation/budgets, ambiguous remote AI/embedding billing, earlier dependency advisories and operational/identity/restore verification. The passing shell suite is not an all-application security or accessibility certification. Native pointer drag and other product deferrals remain in [PROGRESS](docs/PROGRESS.md).

## Operations and data handling

Follow [RUNBOOK](docs/RUNBOOK.md) for deployment, incident containment, backup/restore and key rotation. Never replace ENCRYPTION_KEY without a backed-up, reviewed re-encryption plan. Never give API/workers migration/admin credentials, deploy test login, flush quota state to bypass admission, replay ambiguous billable work or use db push to bypass migration history. Use synthetic seeded data for local tests.

[PRIVACY](docs/PRIVACY.md) inventories content-bearing journals, backups, queues and vendor disclosure; no GDPR/DPDP compliance or blanket no-content-logging promise is made. Maintainer licensing/private contact decisions remain open; this policy grants no software license.
