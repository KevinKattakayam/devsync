-- Forward-only; disable FEATURE_AUTOMATION and retain evidence on application rollback.
BEGIN;
CREATE TABLE "AutomationEvent" (
 id TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
 trigger TEXT NOT NULL CHECK (trigger IN ('task_review','blocker','pr_merged','ci_passed')),
 origin TEXT NOT NULL CHECK (origin IN ('human_assertion','signed_webhook')),
 "taskId" TEXT, "repositoryId" TEXT, "sourceId" TEXT NOT NULL,
 "sourceRevision" TEXT NOT NULL, "actorId" TEXT REFERENCES "User"(id) ON DELETE RESTRICT,
 "dedupeKey" TEXT NOT NULL CHECK ("dedupeKey" ~ '^[a-f0-9]{64}$'),
 "requestHash" TEXT NOT NULL CHECK ("requestHash" ~ '^[a-f0-9]{64}$'),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (id,"workspaceId"), UNIQUE ("workspaceId","dedupeKey"),
 CHECK ((origin='human_assertion' AND trigger IN ('task_review','blocker') AND "taskId" IS NOT NULL AND "repositoryId" IS NULL AND "actorId" IS NOT NULL) OR (origin='signed_webhook' AND trigger IN ('pr_merged','ci_passed') AND "taskId" IS NULL AND "repositoryId" IS NOT NULL AND "actorId" IS NULL))
);
CREATE TABLE "AutomationExecution" (
 id TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL,
 "ruleId" TEXT NOT NULL, "eventId" TEXT NOT NULL, "ruleVersion" INTEGER NOT NULL CHECK ("ruleVersion">0),
 status TEXT NOT NULL CHECK (status IN ('pending_approval','approved','completed','unavailable','cancelled','failed')),
 "approvedBy" TEXT REFERENCES "User"(id) ON DELETE RESTRICT, "errorCode" TEXT,
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(), "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY ("ruleId","workspaceId") REFERENCES "AutomationRule"(id,"workspaceId") ON DELETE CASCADE,
 FOREIGN KEY ("eventId","workspaceId") REFERENCES "AutomationEvent"(id,"workspaceId") ON DELETE CASCADE,
 UNIQUE (id,"workspaceId"), UNIQUE ("workspaceId","ruleId","eventId"),
 CHECK ("errorCode" IS NULL OR "errorCode" IN ('notification_unconfigured','escalation_unconfigured','ci_verification_unavailable','source_unavailable','approval_revoked','rule_disabled','provider_unavailable','worker_failed')),
 CHECK ((status='pending_approval' AND "approvedBy" IS NULL) OR (status<>'pending_approval' AND "approvedBy" IS NOT NULL))
);
CREATE INDEX "AutomationExecution_debounce_idx" ON "AutomationExecution" ("workspaceId","ruleId","createdAt" DESC);
CREATE TABLE "AutomationAudit" (
 id TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL, "executionId" TEXT NOT NULL,
 kind TEXT NOT NULL CHECK (kind IN ('created','approved','started','retrying','completed','unavailable','cancelled','failed')),
 "actorId" TEXT REFERENCES "User"(id) ON DELETE RESTRICT, "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 FOREIGN KEY ("executionId","workspaceId") REFERENCES "AutomationExecution"(id,"workspaceId") ON DELETE CASCADE
);
CREATE INDEX "AutomationAudit_timeline_idx" ON "AutomationAudit" ("workspaceId","executionId","createdAt",id);
CREATE TABLE "AutomationLease" (
 "executionId" TEXT PRIMARY KEY, "workspaceId" TEXT NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
 token TEXT, "leaseUntil" TIMESTAMPTZ,
 UNIQUE ("executionId","workspaceId"),
 FOREIGN KEY ("executionId","workspaceId") REFERENCES "AutomationExecution"(id,"workspaceId") ON DELETE CASCADE,
 CHECK ((token IS NULL AND "leaseUntil" IS NULL) OR (token IS NOT NULL AND "leaseUntil" IS NOT NULL))
);
ALTER TABLE "AutomationEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY automation_event_tenant ON "AutomationEvent" FOR ALL USING ("workspaceId"=current_setting('app.current_tenant_id',true)) WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true));
ALTER TABLE "AutomationExecution" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationExecution" FORCE ROW LEVEL SECURITY;
CREATE POLICY automation_execution_tenant ON "AutomationExecution" FOR ALL USING ("workspaceId"=current_setting('app.current_tenant_id',true)) WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true));
ALTER TABLE "AutomationAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationAudit" FORCE ROW LEVEL SECURITY;
CREATE POLICY automation_audit_read ON "AutomationAudit" FOR SELECT USING ("workspaceId"=current_setting('app.current_tenant_id',true));
CREATE POLICY automation_audit_append ON "AutomationAudit" FOR INSERT WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true));
ALTER TABLE "AutomationLease" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationLease" FORCE ROW LEVEL SECURITY;
CREATE POLICY automation_lease_tenant ON "AutomationLease" FOR ALL USING ("workspaceId"=current_setting('app.current_tenant_id',true)) WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true));
COMMIT;
