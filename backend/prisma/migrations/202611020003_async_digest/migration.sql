-- Forward-only. Roll back by disabling FEATURE_ASYNC_DIGEST; retain preferences
-- and additive source metadata. No content snapshots or delivery copies are stored.
CREATE TABLE "AsyncDigestPreference" (
 "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
 "userId" TEXT NOT NULL REFERENCES "User"(id) ON DELETE CASCADE,
 enabled BOOLEAN NOT NULL DEFAULT false,
 revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
 "acknowledgedAt" TIMESTAMP(3),
 "acknowledgedId" TEXT,
 "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 PRIMARY KEY ("workspaceId", "userId"),
 CHECK (("acknowledgedAt" IS NULL) = ("acknowledgedId" IS NULL))
);
ALTER TABLE "AsyncDigestPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AsyncDigestPreference" FORCE ROW LEVEL SECURITY;
CREATE POLICY digest_personal ON "AsyncDigestPreference" FOR ALL
 USING ("workspaceId"=current_setting('app.current_tenant_id',true) AND "userId"=current_setting('app.digest_actor_id',true))
 WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true) AND "userId"=current_setting('app.digest_actor_id',true));
