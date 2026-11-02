ALTER TABLE "EmbeddingJob" ADD COLUMN "workspaceId" TEXT,
  ADD COLUMN revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "leaseToken" TEXT,
  ADD COLUMN "leaseUntil" TIMESTAMP(3);
UPDATE "EmbeddingJob" j SET "workspaceId"=d."workspaceId" FROM "Document" d
  WHERE j."resourceType"='document' AND j."resourceId"=d.id;
UPDATE "EmbeddingJob" j SET "workspaceId"=s."workspaceId" FROM "Snippet" s
  WHERE j."resourceType"='snippet' AND j."resourceId"=s.id;
UPDATE "EmbeddingJob" j SET "workspaceId"=b."workspaceId" FROM "Task" t
  JOIN "Column" c ON c.id=t."columnId" JOIN "Board" b ON b.id=c."boardId"
  WHERE j."resourceType"='task' AND j."resourceId"=t.id;
UPDATE "EmbeddingJob" SET status='dead', "lastError"='Unresolved legacy scope; operator review required'
  WHERE "workspaceId" IS NULL;
ALTER TABLE "EmbeddingJob" ADD CONSTRAINT "EmbeddingJob_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "Workspace"(id) ON DELETE CASCADE ON UPDATE CASCADE;
