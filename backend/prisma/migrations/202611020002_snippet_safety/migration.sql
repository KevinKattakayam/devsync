-- Forward only. Roll back application behavior by disabling FEATURE_SNIPPET_SAFETY;
-- retain this additive table and already-redacted content. Redaction cannot be undone.
CREATE UNIQUE INDEX "Snippet_id_workspaceId_key" ON "Snippet"(id, "workspaceId");
CREATE TABLE "SnippetSafetyFinding" (
  id TEXT PRIMARY KEY,
  "workspaceId" TEXT NOT NULL,
  "snippetId" TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('private-key','github-token','aws-access-key','provider-key','bearer-token','credential-assignment','credential-url')),
  "maskedPreview" TEXT NOT NULL CHECK ("maskedPreview" = '[REDACTED:' || type || ']'),
  FOREIGN KEY ("snippetId", "workspaceId") REFERENCES "Snippet"(id,"workspaceId") ON DELETE CASCADE ON UPDATE RESTRICT
);
CREATE INDEX "SnippetSafetyFinding_workspaceId_snippetId_idx" ON "SnippetSafetyFinding"("workspaceId","snippetId");
ALTER TABLE "SnippetSafetyFinding" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SnippetSafetyFinding" FORCE ROW LEVEL SECURITY;
CREATE POLICY snippet_safety_tenant ON "SnippetSafetyFinding" FOR ALL
  USING ("workspaceId" = current_setting('app.current_tenant_id', true))
  WITH CHECK ("workspaceId" = current_setting('app.current_tenant_id', true));
