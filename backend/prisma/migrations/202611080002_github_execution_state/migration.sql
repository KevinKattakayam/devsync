-- Additive execution evidence only. Retain on application rollback.
ALTER TABLE "GitHubRepository" ADD COLUMN "providerDisconnectedAt" TIMESTAMPTZ;
ALTER TABLE "GitHubRepository" ADD CONSTRAINT "GitHubRepository_id_workspaceId_key" UNIQUE (id,"workspaceId");
CREATE TABLE "GitHubExecutionState" (
 "repositoryId" TEXT NOT NULL,
 "workspaceId" TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('pull_request','check_run','review')),
 subject TEXT NOT NULL CHECK (length(subject) BETWEEN 1 AND 191),
 state TEXT NOT NULL,
 conclusion TEXT,
 "headSha" TEXT,
 "pullNumber" INTEGER CHECK ("pullNumber">0),
 "providerAt" TIMESTAMPTZ NOT NULL,
 "observedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 rank INTEGER NOT NULL,
 PRIMARY KEY ("repositoryId",kind,subject),
 FOREIGN KEY ("repositoryId","workspaceId") REFERENCES "GitHubRepository"(id,"workspaceId") ON DELETE CASCADE,
 CHECK ((kind='pull_request' AND state IN ('open','closed','merged')) OR (kind='check_run' AND state IN ('queued','in_progress','completed')) OR (kind='review' AND state IN ('approved','changes_requested','commented','dismissed')))
);
ALTER TABLE "GitHubExecutionState" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GitHubExecutionState" FORCE ROW LEVEL SECURITY;
CREATE POLICY github_execution_tenant ON "GitHubExecutionState" FOR ALL
 USING ("workspaceId"=current_setting('app.current_tenant_id',true))
 WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true));

-- A delivery ID is an unsigned header. Fence identical authenticated bodies as well.
CREATE TABLE "GitHubWebhookProof" (
 "repositoryId" TEXT NOT NULL,
 "workspaceId" TEXT NOT NULL,
 digest TEXT NOT NULL CHECK (digest ~ '^[a-f0-9]{64}$'),
 "observedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY ("repositoryId",digest),
 FOREIGN KEY ("repositoryId","workspaceId") REFERENCES "GitHubRepository"(id,"workspaceId") ON DELETE CASCADE
);
ALTER TABLE "GitHubWebhookProof" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "GitHubWebhookProof" FORCE ROW LEVEL SECURITY;
CREATE POLICY github_proof_tenant ON "GitHubWebhookProof" FOR ALL
 USING ("workspaceId"=current_setting('app.current_tenant_id',true))
 WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true));
