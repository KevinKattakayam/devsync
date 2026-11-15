-- Additive personal state; disable FEATURE_ASYNC_DIGEST to roll back access.
CREATE TABLE "InboxReadState" (
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  "activityId" TEXT NOT NULL REFERENCES "Activity"(id) ON DELETE CASCADE,
  "readAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY ("workspaceId", "userId", "activityId")
);
ALTER TABLE "InboxReadState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxReadState" FORCE ROW LEVEL SECURITY;
CREATE POLICY inbox_personal ON "InboxReadState" FOR ALL
 USING ("workspaceId" = current_setting('app.current_tenant_id', true) AND "userId" = current_setting('app.digest_actor_id', true))
 WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true) AND "userId" = current_setting('app.digest_actor_id', true));
