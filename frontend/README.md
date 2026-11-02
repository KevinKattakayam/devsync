# DevSync frontend

Next.js app using the shared shell and [design system](../docs/ui/DESIGN.md). Start with the repository [README](../README.md), [runbook](../docs/RUNBOOK.md) and [contribution guide](../CONTRIBUTING.md); this directory alone does not provision Clerk, PostgreSQL, Redis or the API.

Install the locked dependencies with `npm ci`. With private local configuration prepared, `npm run dev` starts Next.js on port3000. For the one-command local service graph use `docker compose up --build --detach --wait` from repository root. Keyless setup shows guidance and leaves protected workspace access unavailable.

Scripts: `lint`, `format:check`, `typecheck`, `test` (Node runner and Vitest), `test:components`, `build` and `start`. Recorded production gates use `npm run build -- --webpack`. Public NEXT_PUBLIC settings are build inputs; provider secret keys stay server-side. Do not confuse the isolated testing adapter with normal authentication.

[Architecture](../docs/ARCHITECTURE.md), [API](../docs/API.md), [actual quality results and limits](../docs/FINAL_REPORT.md). Follow [AGENTS.md](AGENTS.md) before frontend implementation; no application changes are part of the Phase5c documentation session.
