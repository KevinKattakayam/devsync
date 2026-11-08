-- Forward only. A request records manual review, never an export job or deletion authorization.
CREATE TABLE "WorkspaceExportRequest" (
 id TEXT PRIMARY KEY,
 "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
 "requestedBy" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 status TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED' CHECK (status='REVIEW_REQUIRED'),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE ("workspaceId", "requestedBy")
);
ALTER TABLE "WorkspaceExportRequest" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceExportRequest" FORCE ROW LEVEL SECURITY;
CREATE POLICY export_request_tenant ON "WorkspaceExportRequest" FOR ALL
 USING ("workspaceId"=current_setting('app.current_tenant_id',true))
 WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true));
