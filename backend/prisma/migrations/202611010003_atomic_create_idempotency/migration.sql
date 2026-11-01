CREATE TABLE "ApiIdempotencyRecord" (
  id TEXT PRIMARY KEY,
  "authorityId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  response JSONB,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ApiIdempotencyRecord_authorityId_expiresAt_idx" ON "ApiIdempotencyRecord"("authorityId", "expiresAt");
CREATE INDEX "ApiIdempotencyRecord_expiresAt_idx" ON "ApiIdempotencyRecord"("expiresAt");
ALTER TABLE "ApiIdempotencyRecord" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ApiIdempotencyRecord" FORCE ROW LEVEL SECURITY;
CREATE POLICY receipt_authority ON "ApiIdempotencyRecord"
  USING ("authorityId" = current_setting('app.current_authority_id', true))
  WITH CHECK ("authorityId" = current_setting('app.current_authority_id', true));
