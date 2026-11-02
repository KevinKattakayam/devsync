-- Forward-only. Disable the feature to roll back the application; retain data.
CREATE TABLE "DecisionReceipt" (
  id TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
  "sourceKind" TEXT NOT NULL CHECK ("sourceKind" IN ('document', 'task')),
  "sourceId" TEXT NOT NULL,
  "sourceRevision" TEXT NOT NULL,
  excerpt TEXT NOT NULL CHECK (length(excerpt) BETWEEN 1 AND 5000),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  rationale TEXT NOT NULL CHECK (length(rationale) BETWEEN 1 AND 8000),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'ACCEPTED', 'SUPERSEDED')),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  "createdBy" TEXT NOT NULL,
  "acceptedBy" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "supersededById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (id, "workspaceId"),
  FOREIGN KEY ("supersededById", "workspaceId") REFERENCES "DecisionReceipt"(id, "workspaceId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CHECK ("supersededById" IS NULL OR "supersededById" <> id),
  CHECK ((status='DRAFT' AND "acceptedBy" IS NULL AND "acceptedAt" IS NULL AND "supersededById" IS NULL)
    OR (status='ACCEPTED' AND "acceptedBy" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "supersededById" IS NULL)
    OR (status='SUPERSEDED' AND "acceptedBy" IS NOT NULL AND "acceptedAt" IS NOT NULL AND "supersededById" IS NOT NULL))
);
CREATE INDEX "DecisionReceipt_workspaceId_createdAt_idx" ON "DecisionReceipt"("workspaceId", "createdAt");
ALTER TABLE "DecisionReceipt" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DecisionReceipt" FORCE ROW LEVEL SECURITY;
CREATE POLICY decision_receipt_tenant ON "DecisionReceipt" FOR ALL
  USING ("workspaceId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true));
