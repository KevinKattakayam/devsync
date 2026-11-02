# AI quota and usage evidence — Phase 3f follow-up

Four seeded, isolated fixture journeys use real production authority, non-bypass database access, Redis reservation/settlement and the v3 endpoints. The operator-owned reservation is explicitly an admission fixture, not an AI answer/provider call or evaluation result. Provider keys are empty. No SSE interception is used. Owner/viewer usage and quota rejection are captured at1440px/390px in dark/light.

Initial usable run:4 passed (36.8s),12 screenshots/axe reports with zero violations. Final run after correcting the Document tools grouping role:4 passed (31.9s),12 screenshots/axe reports with zero violations. No repeated unchanged build or extra audit. The first attempt could not launch Playwright's missing browser download; the installed Chrome executable was used thereafter. Initial and final folders retain actual captures.

## Review

Hierarchy: the usage heading, explanation, personal/workspace definition lists and refresh action are distinct. Daily/monthly and concurrency limits are explicit, and the quota error gives the real UTC reset instead of a made-up retry estimate. Exact ISO timestamps wrap on mobile; readable, but less refined than localized dates. A settings link would improve the error's actionability; current text directs the user to settings without adding a new workflow.

Spacing/alignment/density: existing shell spacing, neutral design-system surfaces, type and focus rings remain consistent with DESIGN.md. The settings explanation is fairly dense; it makes conservative charging and global personal scope explicit. Definition lists align vertically on mobile. No tested horizontal overflow. Settings uses an internal scroll container, so full-page images do not expose every offscreen member/invitation control; these are usage-state captures, not complete settings visual acceptance.

Contrast: final axe reports show zero violations. Remaining color-contrast incompletes concern existing settings labels/help text below or behind the fixed shell/floating Copilot, and overlapping collaborator initials in the editor presence stack. Source targets and screenshot review identify obscuration/overlap rather than a demonstrated new usage-text contrast failure. Complete manual verification of every offscreen/overlapping text state remains deferred; zero automated violations is not full WCAG certification. Raw incomplete nodes remain in each report.

Accessibility: manual initial axe review found aria-label on the generic Document tools div. Added role=group and asserted its accessible name in the final real-page journey. Refresh is exercised with Enter; component tests also tab to the retry action. Quota denial creates no draft/apply control. Existing skip links, drawer behavior and server-enforced viewer read-only document policy remain unchanged.

Coverage limits: only Chromium,1440/390 and the exercised states. No360px/zoom/screen-reader certification, every loading/error shell permutation, real SDK network fault injection, provider billing or model quality evaluation. Existing transport tests retain their explicitly labeled intercepted SSE fixtures and were updated to the versioned completion URL; this session's new quota browser journey is separate. Deferred PWA/offline belongs to Phase5.
