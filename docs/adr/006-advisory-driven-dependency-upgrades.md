# ADR 006 — Verified advisory floors and coherent dependency graphs (I01)

Status: accepted; Moderate/Low advisories remain open.

Context: current pre-update audits reported backend60 entries (2 Critical/12 High) and frontend73 (2 Critical/16 High). The app uses Clerk, not the installed unused NextAuth package. TipTap extensions have exact peer-version coupling; mixed release graphs fail normal resolution.

Options: force npm's proposed upgrades wholesale, suppress peer checks, or remediate known vulnerable dependencies with coherent release sets and rerun actual contracts/tests/builds.

Decision: upgrade Next/eslint-config-next to16.4.3; align used TipTap v3 packages to3.32.2 and declare direct core/y-tiptap imports. Remove unused NextAuth and the unused deprecated cursor extension. Upgrade Express within v4, Multer tov2.5 and Zod tov4.6.7; adapt validation error iteration to Zod's issues field. Apply non-forced compatible advisory fixes. Upgrade matching testcontainers/PostgreSQL tooling tov12.2.1 to remove its remaining High advisory chain; preserve existing assertions and Prisma v5.22.

Consequences: no --force, --legacy-peer-deps, rule suppression or security test deletion. A fresh temporary resolution avoided stale TipTap peers; npm install repaired an AJV placement inconsistency, and clean npm ci then passed. Failed attempts and final gates are retained as evidence. Backend55 tests and frontend5 unit tests pass with final graphs. Dependency floor tests are regressions for the known advisory fixes, not a replacement for future audits or production exploit proof. No collaboration model/protocol rewrite or observability feature work was undertaken.

Final npm audit: backend0 Critical/0 High,39 Moderate/2 Low; frontend0 Critical/0 High,16 Moderate/0 Low. Full JSON remains available, and remaining advisories/deprecation warnings are not declared resolved. No production deployment happened.
