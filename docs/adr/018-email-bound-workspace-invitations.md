# ADR018: authenticated recipient invitation acceptance

Status: accepted and implemented in Phase1e.

Context: the legacy invite endpoint immediately adds a registered user; there is no acceptance flow. Adding a bearer link would require storing or delivering a new secret and careful receipt handling.

Options: replace the old endpoint; send bearer invitations; or add pending invitations accepted only by the authenticated, verified email recipient.

Decision: preserve the legacy immediate-add contract. Add an explicit pending-invitation API and UI. A link identifies an invitation but grants no authority by itself. Acceptance requires the active authenticated principal's verified provider email, the matching recipient, an unsuspended workspace, a current unrevoked/unexpired invitation and the fixed EDITOR/VIEWER grant. Central invitation policy handles this pre-membership exception. It never trusts an email or role from the acceptance body.

Invitation data has forced RLS for its tenant or verified recipient context. Acceptance, membership creation and activity commit together. Existing memberships retain their role; a second acceptance cannot recreate a membership removed later. Workspace owners may revoke pending invitations. No email is claimed to have been sent when the UI only creates a shareable link.

Consequences: recipients need a verified provider email; fixture authentication attests only its seeded emails. Existing immediate-add clients remain compatible, while the product UI uses explicit acceptance. Email delivery/integration is separate from creating a link.

Implementation: additive POST /api[/v1]/workspaces/:id/invitations creates a seven-day pending invitation (EDITOR/VIEWER only); POST /api[/v1]/workspaces/invitations/:invitationId/accept requires a strict empty body and verified recipient profile; DELETE /api[/v1]/workspaces/:id/invitations/:invitationId revokes a pending invitation as OWNER. Creation supports atomic create receipts. Recipient discovery uses transaction-local verified email RLS; acceptance reacquires workspace/user/invitation locks, rechecks active principal/tenant and pending/expiry state, and commits membership/activity/acceptance atomically. Existing memberships retain their role. The database constrains grants to EDITOR/VIEWER. A shareable link is shown with an explicit statement that no email was sent.

Evidence: ten Playwright product journeys against migrated disposable PostgreSQL with a non-bypass runtime role, Redis and the actual HTTP/UI/CRDT implementation, including acceptance for both roles, reuse after removal, expiry, wrong-recipient, forged grant, revocation and concurrent acceptance. Expiry is advanced by updating only the disposable invitation record through the test admin connection; the application clock/policy is not mocked. Clerk itself is not simulated as a provider success: fixture authentication attests only the seeded email identities; real-provider sign-in remains separately unverified.
