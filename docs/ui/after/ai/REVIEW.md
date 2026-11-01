# Bounded AI editor review

These are **transport/UI fixtures, not model answers or an evaluation dataset**. Each test uses seeded owner login and an actual document in disposable migrated PostgreSQL/Redis; Playwright intercepts only the AI response with explicit fixture text and a source record using the seeded Welcome title. No live provider, factual support, retrieval ranking or model injection resistance is certified by these captures.

Final four browser tests pass. Eight screenshots/eight axe reports cover complete and failed draft states at1440/390 in dark/light, with zero reported violations. Width assertions pass for these states. Insertion preserves the AI-generated label and numbered source legend in the existing CRDT document. Partial error output cannot be applied/copied and provider-private error text is absent. Unit tests separately exercise byte-split UTF8, CRLF and JSON framing; browser response interception is not proof of real-time provider chunk timing.

## Critique and correction

- Hierarchy: the generated draft has an explicit label, review actions and a separate error notice. Insert stays the primary action. Failure instructions are readable on mobile. The AI button still consumes a separate row, inherited from the editor layout.
- Spacing/alignment/density: controls wrap without page-level horizontal overflow. Reference metadata sits far below the preview due to the existing canvas minimum height, and its qualification text is dense on390. Long title inputs truncate visibly. More compact reference placement remains deferred.
- Contrast: initial four browser cases failed on source-type text at reduced opacity (light report2.63:1). Removed opacity; final reports have no violations. A formatting-only gate failure after that JSX change was fixed before the passing build.
- DESIGN consistency: existing semantic surfaces, Geist, shared buttons/dialog and focus styles are reused; no new palette or gradients. The legacy editor generic labeled-container/overlay polish remains outside this slice.
- Keyboard/responsive: fixtures use labeled prompt fields, Generate and Insert controls. Full keyboard traversal, screen-reader certification,360px, slow-stream Stop and unmount cancellation are not browser-covered. Existing unit framing tests and abort wiring are not substitutes for those checks.

Initial and final images are retained. Final desktop complete/mobile error captures were individually inspected alongside the initial mobile complete capture. The first post-contrast browser run failed on an ambiguous alert selector (AI error plus Next route announcer); final targeting retains the AI error assertion. No assertion or axe rule was removed. This was a test correction, not another product redesign pass.

Raw incomplete rules remain: aria-prohibited-attr on inherited generic labeled editor containers; overlap/clipping color-contrast and link-in-text-block checks in the shared shell/editor. They are not declared resolved and no complete WCAG certification is claimed. No pixel baseline comparison, usage metric, quota gauge, provider quality score or evaluation results are invented.

Quota reservations/usage UI, streamed provider fallback, richer tracing, claim-level citation verification, evaluation scaffold and PWA are explicitly deferred in [progress](../../../PROGRESS.md). Existing central workspace retrieval/membership regression tests remain the server isolation evidence; browser fixtures intercept AI and do not replace that evidence.
