# P02 decision receipts — review and evidence

Evidence uses disposable migrated PostgreSQL/Redis, the existing seed, and the test-only fixture login. No Clerk sign-in, model, paid API or real credentials are involved. The source documents and receipt text are explicitly test-created records, not claims about a real team's decisions. Only the unavailable-state journey aborts a request; lifecycle and role-denial requests reach the real backend and tenant database.

## Review findings and corrections

- Hierarchy: one page heading, a restrained introduction and clear draft/accepted/superseded labels. The quote is visually separated from the human rationale. An explicit confirmation explains acceptance without implying team consensus.
- Spacing/alignment: shared16px mobile/32px desktop page padding, wrapping actions and consistent form labels. The source preview scrolls inside the dialog; no document-level horizontal overflow is allowed by the browser assertions.
- Contrast: initial axe runs sampled controls while source loading/modal animation was settling. Capture now waits for the real ready state and finite animations, retaining all WCAG rules/assertions. A subsequent run found an actual light-theme hovered-primary contrast failure (reported4.39:1) on Confirm supersession. P02 buttons now retain full token opacity on enabled hover, and the E2E explicitly hovers that confirmation before axe. Shared component styles outside P02 were not changed.
- Keyboard: new Tab/Shift+Tab wrap and Escape/return-focus assertions exposed a real missing focus return in the controlled dialog. P02 now remembers the opening button and restores it explicitly, with a page-heading fallback if a mutation removes the opener. The assertions remain in the tests. Source selection also uses Enter in the browser journey.
- Density/design consistency: semantic graphite surfaces, a blue action, Lucide shell icons and existing Radix controls follow DESIGN.md. The full source fingerprint remains visible and wraps on mobile. It is useful provenance but visually dense; a compact disclosure may be a future refinement.
- Mobile: sidebar stays outside the content flow, actions wrap and the dialog scrolls within the viewport. Rapid successive actions can stack transient success toasts over lower receipt metadata; the content remains available after dismissal/expiry. This known shared-toast presentation limit is retained honestly rather than claiming a perfect mobile review. Browser evidence covers390px;360px/browser and assistive-technology coverage are not claimed by these captures.

## Axe incomplete review

Raw JSON retains incomplete items. `aria-hidden-focus` points at Radix focus guards and the background app shell while a modal is open. The browser journey checks forward/backward focus wrapping, Escape dismissal and restoration to the opener; Select uses Enter. These checks support keyboard containment, not a screen-reader certification.

`color-contrast` incomplete items concern text/buttons partly covered by a dialog edge or transient toast, including the source-preview help, acceptance description, replacement link, receipt attribution and the pre-existing AI Copilot trigger. Source and screenshot review use the semantic token pairs documented in DESIGN.md; no disabled rule or fabricated contrast result resolves these items. Obscured states are recorded as incompletes, not passes. Broader screen-reader, high-zoom and additional-browser review remains a follow-up.

## Run history

- `initial/`: all four cases failed at form axe; the failed reports/screenshots remain.
- `settled/`: finite-animation/source-ready capture corrected the transient measurements. The run was interrupted after exposing a loading-skeleton versus empty-list race in the test after archiving; no completed-suite pass is claimed.
- `final/`: the added Escape focus-return assertion failed all four cases, exposing the actual controlled-dialog focus issue.
- `focus-fix/`: three cases passed; light390 caught the hovered button contrast failure. Earlier mobile/wide screenshots were reviewed to identify the focus/contrast corrections and remaining density/toast issues.
- `contrast-fix/`: authoritative final run: four tests passed (43.8s), with40 captures/40 axe reports and zero reported violations. No additional unchanged rebuild or evidence audit is implied by this ledger.
