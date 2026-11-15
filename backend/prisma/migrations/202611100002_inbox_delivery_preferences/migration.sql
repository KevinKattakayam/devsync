-- Preferences only; delivery providers and scheduling are not enabled by this migration.
CREATE TABLE "InboxDeliveryPreference" (
  "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
  "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 100),
  "quietStart" INTEGER CHECK ("quietStart" BETWEEN 0 AND 1439),
  "quietEnd" INTEGER CHECK ("quietEnd" BETWEEN 0 AND 1439),
  "batchMinutes" INTEGER NOT NULL CHECK ("batchMinutes" IN (15,60,1440)),
  PRIMARY KEY ("workspaceId", "userId"),
  CHECK (("quietStart" IS NULL AND "quietEnd" IS NULL) OR ("quietStart" IS NOT NULL AND "quietEnd" IS NOT NULL AND "quietStart" <> "quietEnd"))
);
ALTER TABLE "InboxDeliveryPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "InboxDeliveryPreference" FORCE ROW LEVEL SECURITY;
CREATE POLICY inbox_delivery_personal ON "InboxDeliveryPreference" FOR ALL
 USING ("workspaceId" = current_setting('app.current_tenant_id', true) AND "userId" = current_setting('app.digest_actor_id', true))
 WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true) AND "userId" = current_setting('app.digest_actor_id', true));
