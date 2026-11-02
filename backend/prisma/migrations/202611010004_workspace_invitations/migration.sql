CREATE TABLE "WorkspaceInvitation" (
  id TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role "Role" NOT NULL CHECK (role IN ('EDITOR', 'VIEWER')),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "WorkspaceInvitation_workspaceId_idx" ON "WorkspaceInvitation"("workspaceId");
CREATE INDEX "WorkspaceInvitation_email_idx" ON "WorkspaceInvitation"(email);
ALTER TABLE "WorkspaceInvitation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "WorkspaceInvitation" FORCE ROW LEVEL SECURITY;
CREATE POLICY invitation_tenant ON "WorkspaceInvitation" FOR ALL
  USING ("workspaceId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true));
CREATE POLICY invitation_recipient ON "WorkspaceInvitation" FOR SELECT
  USING (email = current_setting('app.invitation_recipient', true));
