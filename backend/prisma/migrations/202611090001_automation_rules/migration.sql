-- Forward-only, disabled by default; rollback leaves RLS-protected records intact.
BEGIN;
CREATE TABLE "AutomationRule" (
 id TEXT PRIMARY KEY,
 "workspaceId" TEXT NOT NULL REFERENCES "Workspace"(id) ON DELETE CASCADE,
 "createdBy" TEXT NOT NULL REFERENCES "User"(id) ON DELETE RESTRICT,
 title TEXT NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
 trigger TEXT NOT NULL CHECK (trigger IN ('task_review','blocker','pr_merged','ci_passed')),
 action TEXT NOT NULL CHECK (action IN ('notify','escalate','prepare_report','update_linked_status')),
 condition TEXT NOT NULL CHECK (condition IN ('always','high_priority')),
 "debounceSeconds" INTEGER NOT NULL CHECK ("debounceSeconds" BETWEEN 1 AND 86400),
 enabled BOOLEAN NOT NULL DEFAULT false,
 version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
 "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE (id,"workspaceId"),
 CHECK ((trigger='task_review' AND action='notify') OR (trigger='blocker' AND action='escalate') OR (trigger='pr_merged' AND action='prepare_report') OR (trigger='ci_passed' AND action='update_linked_status')),
 CHECK (condition='always' OR trigger IN ('task_review','blocker'))
);
CREATE INDEX "AutomationRule_workspace_idx" ON "AutomationRule" ("workspaceId", "createdAt", id);
ALTER TABLE "AutomationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRule" FORCE ROW LEVEL SECURITY;
CREATE POLICY automation_rule_tenant ON "AutomationRule" FOR ALL
 USING ("workspaceId"=current_setting('app.current_tenant_id',true))
 WITH CHECK ("workspaceId"=current_setting('app.current_tenant_id',true));
COMMIT;
