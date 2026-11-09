-- Append-only receipt evidence. Keep records when rolling application code back.
BEGIN;
CREATE TABLE "DecisionExecutionEvent" (
  id TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "receiptId" TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('human_assertion','linked_task','linked_pull_request','outcome_confirmed')),
  evidence TEXT NOT NULL CHECK (length(trim(evidence)) BETWEEN 1 AND 2000),
  "occurredAt" TIMESTAMPTZ NOT NULL,
  "recordedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "createdBy" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
  "taskId" TEXT,
  "repositoryId" TEXT,
  "pullNumber" INTEGER CHECK ("pullNumber" > 0),
  FOREIGN KEY ("receiptId", "workspaceId") REFERENCES "DecisionReceipt"(id, "workspaceId") ON DELETE CASCADE,
  CHECK ((kind = 'linked_task' AND "taskId" IS NOT NULL AND "repositoryId" IS NULL AND "pullNumber" IS NULL)
    OR (kind = 'linked_pull_request' AND "taskId" IS NULL AND "repositoryId" IS NOT NULL AND "pullNumber" IS NOT NULL)
    OR (kind IN ('human_assertion','outcome_confirmed') AND "taskId" IS NULL AND "repositoryId" IS NULL AND "pullNumber" IS NULL))
);
CREATE INDEX "DecisionExecutionEvent_receipt_timeline_idx" ON "DecisionExecutionEvent" ("workspaceId", "receiptId", "recordedAt", id);
ALTER TABLE "DecisionExecutionEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DecisionExecutionEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY decision_execution_read ON "DecisionExecutionEvent" FOR SELECT
  USING ("workspaceId" = current_setting('app.current_tenant_id', true));
CREATE POLICY decision_execution_append ON "DecisionExecutionEvent" FOR INSERT
  WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true));
COMMIT;
