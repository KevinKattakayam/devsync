# ADR018: authenticated recipient invitation acceptance

Status: proposed; implementation pending.

Context: the legacy invite endpoint immediately adds a registered user; there is no acceptance flow. Adding a bearer link would require storing or delivering a new secret and careful receipt handling.

Options: replace the old endpoint; send bearer invitations; or add pending invitations accepted only by the authenticated, verified email recipient.

Decision: preserve the legacy immediate-add contract. Add an explicit pending-invitation API and UI. A link identifies an invitation but grants no authority by itself. Acceptance requires the active authenticated principal's verified provider email, the matching recipient, an unsuspended workspace, a current unrevoked/unexpired invitation and the fixed EDITOR/VIEWER grant. Central invitation policy handles this pre-membership exception. It never trusts an email or role from the acceptance body.

Invitation data has forced RLS for its tenant or verified recipient context. Acceptance, membership creation and activity commit together. Existing memberships retain their role; a second acceptance cannot recreate a membership removed later. Workspace owners may revoke pending invitations. No email is claimed to have been sent when the UI only creates a shareable link.

Consequences: recipients need a verified provider email; fixture authentication attests only its seeded emails. Existing immediate-add clients remain compatible, while the product UI uses explicit acceptance. Email delivery/integration is separate from creating a link.
