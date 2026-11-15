-- Personal read markers for existing automation execution evidence; no delivery copy.
CREATE TABLE "InboxAutomationReadState" (
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "executionId" TEXT NOT NULL,
  "readAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("workspaceId", "userId", "executionId"),
  FOREIGN KEY ("executionId", "workspaceId") REFERENCES "AutomationExecution"(id, "workspaceId") ON DELETE CASCADE
);
ALTER TABLE "InboxAutomationReadState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxAutomationReadState" FORCE ROW LEVEL SECURITY;
CREATE POLICY inbox_automation_personal ON "InboxAutomationReadState" FOR ALL
 USING ("workspaceId" = current_setting('app.current_tenant_id', true) AND "userId" = current_setting('app.digest_actor_id', true))
 WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true) AND "userId" = current_setting('app.digest_actor_id', true));
