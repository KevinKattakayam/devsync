ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS "ScimProvisioningToken" (
  "id" TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3)
);
CREATE INDEX IF NOT EXISTS "ScimProvisioningToken_workspaceId_idx" ON "ScimProvisioningToken"("workspaceId");

CREATE TABLE IF NOT EXISTS "ScimExternalIdentity" (
  "id" TEXT PRIMARY KEY,
  "externalId" TEXT NOT NULL,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScimExternalIdentity_workspaceId_externalId_key" UNIQUE ("workspaceId", "externalId")
);
CREATE INDEX IF NOT EXISTS "ScimExternalIdentity_userId_idx" ON "ScimExternalIdentity"("userId");
