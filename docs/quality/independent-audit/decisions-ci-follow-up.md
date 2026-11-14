# Decisions CI follow-up

Run `43595287678` failed when the viewer's second same-route document navigation was interrupted by another navigation. The test now refreshes the existing viewer receipt list through the application's Refresh receipts control. Evidence, role-denial, lifecycle and accessibility assertions remain active. Theme initialization is scoped to the fixture origin, and post-delete operations use named steps with explicit successful source deletion verification.

The user reports all four decisions browser variants passed on the Docker-enabled Ubuntu host after these changes. This is fixture-browser evidence, not real Clerk or provider acceptance. Focused ESLint, testing TypeScript and Prettier checks passed locally. The initiating source of the competing navigation is not established by the CI log.
