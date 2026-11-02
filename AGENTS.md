# AGENTS.md
Project: DevSync upgrade. Branch: upgrade/enterprise. Progress: docs/PROGRESS.md.

Rules (always apply):
- Work only on branch upgrade/enterprise. Commit in small commits. Never push.
- Security and data integrity first. Never weaken a control to pass a test.
- Never fabricate metrics, benchmarks, or novelty claims.
- Do not break API/WebSocket contracts without versioning.
- Run lint, format, type-check, tests and build after each group of changes.
- Never delete or weaken a test. No @ts-ignore, no any, no disabled lint rules.
- Never print or commit secrets.
- Update CHANGELOG.md and docs/PROGRESS.md at the end of every session.
