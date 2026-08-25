CREATE TYPE "SystemRole" AS ENUM ('USER', 'SUPER_ADMIN');
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "systemRole" "SystemRole" NOT NULL DEFAULT 'USER';
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "stripeCustomerId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "stripeSubscriptionId" TEXT;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "monthlyTokenLimit" INTEGER NOT NULL DEFAULT 100000;
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "billingStatus" TEXT NOT NULL DEFAULT 'inactive';
ALTER TABLE "Workspace" ADD COLUMN IF NOT EXISTS "suspendedAt" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_stripeCustomerId_key" ON "Workspace"("stripeCustomerId");
CREATE UNIQUE INDEX IF NOT EXISTS "Workspace_stripeSubscriptionId_key" ON "Workspace"("stripeSubscriptionId");

CREATE TABLE IF NOT EXISTS "TokenUsage" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "requestId" TEXT NOT NULL UNIQUE,
  "tokens" INTEGER NOT NULL CHECK ("tokens" >= 0),
  "source" TEXT NOT NULL,
  "stripeMeterEventId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "TokenUsage_workspaceId_createdAt_idx" ON "TokenUsage"("workspaceId", "createdAt");
