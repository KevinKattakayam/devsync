-- Refuse identity enforcement until an operator has explicitly linked all legacy users.
-- No identity is invented from email and no account is silently deleted.
ALTER TABLE "User" ALTER COLUMN "clerkId" SET NOT NULL;
CREATE INDEX "Document_workspaceId_isArchived_updatedAt_idx" ON "Document"("workspaceId", "isArchived", "updatedAt");
CREATE INDEX "Document_parentId_idx" ON "Document"("parentId");
CREATE INDEX "Snippet_workspaceId_updatedAt_idx" ON "Snippet"("workspaceId", "updatedAt");
CREATE INDEX "Board_workspaceId_idx" ON "Board"("workspaceId");
CREATE INDEX "Column_boardId_position_idx" ON "Column"("boardId", "position");
CREATE INDEX "Task_columnId_position_idx" ON "Task"("columnId", "position");
CREATE INDEX "Task_assigneeId_idx" ON "Task"("assigneeId");
CREATE INDEX "Activity_workspaceId_createdAt_idx" ON "Activity"("workspaceId", "createdAt");
CREATE INDEX "WorkspaceMember_workspaceId_idx" ON "WorkspaceMember"("workspaceId");

-- Refuse cross-tenant hierarchy, even when an application role bypasses RLS.
-- Existing invalid parents must be repaired explicitly before migration.
CREATE UNIQUE INDEX "Document_id_workspaceId_key" ON "Document"("id", "workspaceId");
ALTER TABLE "Document" DROP CONSTRAINT "Document_parentId_fkey";
ALTER TABLE "Document" ADD CONSTRAINT "Document_parentId_workspaceId_fkey"
  FOREIGN KEY ("parentId", "workspaceId") REFERENCES "Document"("id", "workspaceId")
  ON DELETE RESTRICT ON UPDATE RESTRICT;
