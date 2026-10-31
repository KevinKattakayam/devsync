# ADR 005 — Historical baseline and verified migration chain (G02/G12/I09/D08)

Status: accepted for fresh databases; existing-database adoption requires operator verification.

Context: the first migration alters tables that no migration creates. The pre-enterprise schema exists in Git at 9deffe2^:backend/prisma/schema.prisma. Reconstructing it from guesses or replacing migrations with db push would lose SQL security policies and migration history.

Options: db push current schema; rewrite applied enterprise migrations; or prepend a baseline generated from the historical schema and add forward-only corrections/indexes.

Decision: generate baseline DDL with Prisma migrate diff --from-empty from the recorded historical schema; leave all four original migrations immutable. Add a forward migration enforcing non-null clerkId after explicit backfill, frequent relationship/list indexes and tenant-bound document hierarchy. db:migrate executes migrate deploy; db:migrate:dev is explicit; remove db:push script. Use a single tenant-scoped seed transaction with stable fixture IDs and caller-supplied Clerk identity mappings, a non-production guard and explicit write opt-in. No passwords/secret defaults or fabricated working identities.

Consequences: fresh pgvector databases can be initialized with the complete actual chain. Existing databases must never execute baseline DDL; operator must verify historical schema/checksums/data and use migrate resolve only after backup/rehearsal. Null clerkIds and cross-workspace parent links intentionally block the forward migration until repaired; it never invents identities or drops offending rows. Legacy enterprise migrations remove old password/refresh fields, so identity cutover must precede their application. FK/column/workspace cascade behavior is otherwise unchanged; broader soft deletion, pagination and transactional write review remain open.

Evidence: actual migrate deploy against isolated pgvector; actual forced-RLS read isolation as NOSUPERUSER NOBYPASSRLS; index existence; idempotent seed; database-level cross-tenant hierarchy test. This does not claim all API callers correctly establish tenant context (G01 remains separate).
