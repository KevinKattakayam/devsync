-- Phase 3: tenancy is represented by Workspace.id.  The application database
-- role must NOT own these tables and must not have BYPASSRLS.
-- Every request against these tables must execute inside withTenantTransaction.

ALTER TABLE "Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Document" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Snippet" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Snippet" FORCE ROW LEVEL SECURITY;
ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Task" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_tenant_isolation ON "Document";
CREATE POLICY document_tenant_isolation ON "Document"
  FOR ALL
  USING ("workspaceId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true));

DROP POLICY IF EXISTS snippet_tenant_isolation ON "Snippet";
CREATE POLICY snippet_tenant_isolation ON "Snippet"
  FOR ALL
  USING ("workspaceId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true));

-- Task has no denormalized workspaceId.  Resolve its tenant through Column and
-- Board.  The policy guards SELECT/UPDATE/DELETE and INSERT separately.
DROP POLICY IF EXISTS task_tenant_isolation ON "Task";
CREATE POLICY task_tenant_isolation ON "Task"
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM "Column" c
      JOIN "Board" b ON b.id = c."boardId"
      WHERE c.id = "Task"."columnId"
        AND b."workspaceId" = current_setting('app.current_tenant_id', true)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM "Column" c
      JOIN "Board" b ON b.id = c."boardId"
      WHERE c.id = "Task"."columnId"
        AND b."workspaceId" = current_setting('app.current_tenant_id', true)
    )
  );

-- Fail closed: direct application access receives no rows until a transaction
-- has called set_config(..., true).  Verify with:
-- SET LOCAL app.current_tenant_id = '<workspace id>';
-- SELECT * FROM "Document";
