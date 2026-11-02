# P04 UI review

Uses disposable seeded databases and the test-only fixture login. All detector candidates are explicitly synthetic, assembled in memory; captures happen after the form has replaced them with masks. No real provider credential, external validation call, model output or raw-input trace is part of the evidence.

The initial run passed all four browser journeys with zero axe violations. Review found duplicate current navigation on the nested safety route; the shell now selects the matching section once. The final journey adds an assertion for a single current workspace link and repeats the feature states after that correction.

- Hierarchy: one page heading, clear warning about heuristic limits, separate editor and explicit review/save stage. Review focus scrolls to the result; it does not claim a clean result proves safety.
- Spacing/alignment: shared16/32px page padding, consistently associated labels, two-column title/language only at larger widths. The secondary reload action is deliberately visible; the long form requires scrolling on mobile.
- Contrast: semantic foreground, muted, warning and action tokens; P04 buttons retain full enabled-hover opacity. The redacted preview remains read-only rather than dimming all text as disabled controls. No color is the only finding indicator.
- Density/design: neutral surfaces and a quiet masked finding list follow DESIGN.md. The code textarea is intentionally tall; a future compact layout could reduce scrolling, but no new layout/view feature was started.
- Mobile: actions and masks wrap; internal textarea scrolling does not expand the page. Browser assertions reject document horizontal overflow. Captures cover390px, not a claimed360px/zoom/device certification.

Raw axe incompletes concern text partly outside the visible scrollport/under the sticky shell header and the existing AI Copilot trigger under transient UI, plus an overlapped error notice. The headings, descriptive text, back link and notice use existing token pairs from DESIGN.md; screenshot review confirms the content is reachable by scrolling. Keyboard tests verify review activation, result focus and Enter selection, and Radix owns Select focus. This is not a screen-reader or additional-browser certification. No axe rule or assertion was removed or disabled.

Authoritative results and exact remaining limits are in docs/PROGRESS.md; final screenshots/JSON are in final/. Initial captures remain in initial/ for the navigation critique. The network-failure state is explicitly intercepted; real create/edit, metadata and denied writes reach the backend.
