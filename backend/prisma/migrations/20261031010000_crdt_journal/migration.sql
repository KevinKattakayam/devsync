BEGIN;
CREATE TABLE "DocumentUpdate" (
 "id" BIGSERIAL PRIMARY KEY, "documentId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
 "digest" TEXT NOT NULL, "update" BYTEA NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY ("documentId","workspaceId") REFERENCES "Document"("id","workspaceId") ON DELETE CASCADE ON UPDATE RESTRICT,
 UNIQUE ("documentId","digest")
);
CREATE INDEX "DocumentUpdate_workspaceId_documentId_id_idx" ON "DocumentUpdate"("workspaceId","documentId","id");
CREATE TABLE "DocumentCrdtBackup" (
 "documentId" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "originalContent" JSONB,
 "originalState" BYTEA, "convertedState" BYTEA NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "restoredAt" TIMESTAMP(3),
 FOREIGN KEY ("documentId","workspaceId") REFERENCES "Document"("id","workspaceId") ON DELETE RESTRICT ON UPDATE RESTRICT,
 UNIQUE ("documentId","workspaceId")
);
ALTER TABLE "DocumentUpdate" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentUpdate" FORCE ROW LEVEL SECURITY;
CREATE POLICY update_tenant ON "DocumentUpdate" FOR ALL
 USING ("workspaceId"=current_setting('app.current_tenant_id',true))
 WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true));
ALTER TABLE "DocumentCrdtBackup" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DocumentCrdtBackup" FORCE ROW LEVEL SECURITY;
CREATE POLICY backup_tenant ON "DocumentCrdtBackup" FOR ALL
 USING ("workspaceId"=current_setting('app.current_tenant_id',true))
 WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true));
COMMIT;
