-- Enterprise identity, RAG, and GitHub workflow integration.
CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clerkId" TEXT;
ALTER TABLE "User" DROP COLUMN IF EXISTS "password";
ALTER TABLE "User" DROP COLUMN IF EXISTS "githubId";
ALTER TABLE "User" DROP COLUMN IF EXISTS "refreshToken";
CREATE UNIQUE INDEX IF NOT EXISTS "User_clerkId_key" ON "User"("clerkId");

ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "clerkOrganizationId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "ssoEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "samlConnectionId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "samlMetadata" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_clerkOrganizationId_key" ON "Workspace"("clerkOrganizationId");
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_samlConnectionId_key" ON "Workspace"("samlConnectionId");

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "embeddingHash" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "yjsState" BYTEA;
ALTER TABLE "Snippet" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "Snippet" ADD COLUMN IF NOT EXISTS "embeddingHash" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "embedding" vector(1536);
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "embeddingHash" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "taskKey" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Task_taskKey_key" ON "Task"("taskKey");

CREATE INDEX IF NOT EXISTS "Document_embedding_hnsw" ON "Document" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "Snippet_embedding_hnsw" ON "Snippet" USING hnsw ("embedding" vector_cosine_ops);
CREATE INDEX IF NOT EXISTS "Task_embedding_hnsw" ON "Task" USING hnsw ("embedding" vector_cosine_ops);

CREATE TABLE IF NOT EXISTS "GitHubRepository" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "installationId" TEXT,
  "repositoryId" TEXT NOT NULL UNIQUE,
  "owner" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "webhookSecret" TEXT NOT NULL,
  "prOpenedColumnId" TEXT,
  "prMergedColumnId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "GitHubRepository_workspaceId_owner_name_key" ON "GitHubRepository"("workspaceId", "owner", "name");

CREATE TABLE IF NOT EXISTS "GitHubWebhookDelivery" (
  "id" TEXT PRIMARY KEY,
  "deliveryId" TEXT NOT NULL UNIQUE,
  "event" TEXT NOT NULL,
  "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "EmbeddingJob" (
  "id" TEXT PRIMARY KEY,
  "resourceType" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "EmbeddingJob_resourceType_resourceId_key" ON "EmbeddingJob"("resourceType", "resourceId");
CREATE INDEX IF NOT EXISTS "EmbeddingJob_status_runAfter_idx" ON "EmbeddingJob"("status", "runAfter");
