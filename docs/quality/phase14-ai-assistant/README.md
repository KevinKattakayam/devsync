# Phase 14 — AI assistant UI increment

## Scope and behavior

Refined the existing feature-flagged grounded preview inside the workspace Copilot drawer. The panel now has a clearer purpose/question hierarchy, responsive evidence cards, inline numbered citation controls, indexed-source context, explicit insufficient-evidence and retry states, and accessible busy/error announcements. Copy states that responses can be incomplete or incorrect, cited excerpts are not verified truth, provider cost is unavailable, and proposals are drafts that are not saved. Provider status details are not rendered to users.

The existing `POST /api/v3/ai/grounded` contract, source types, feature flags, evidence-generation pipeline and server authorization remain intact. The client still re-requests the authorized source route before navigation and restricts returned destinations to the current workspace or a valid GitHub pull request. It also rejects malformed responses and references that do not resolve to a returned source. It does not expose a new write action or claim a proposal was accepted.

## Verification

- Focused component suite: `cd frontend && npm run test:components -- --run tests/grounded-assistant.test.tsx` — exit 0, 9 tests. Covers cited and insufficient-evidence responses, keyboard submission, proposal-not-saved copy, source access withdrawn, unresolved citation rejection, and safe session/permission/quota/service error guidance with retry.
- Browser journey: `E2E_CHROMIUM_PATH=/opt/google/chrome/chrome node tools/ci/browser.mjs grounded` — exit 0, 2 Playwright tests. The owner journey uses a fixture response and fixture source destination at dark/light × 1440/390; it checks Escape dismissal and focus restoration, keyboard submission, citation navigation, retry after simulated service failure and horizontal overflow. A fixture viewer's draft request is denied with HTTP 403 by the isolated local backend and the UI's permission error is exercised with an intercepted response.
- Eight new full-page screenshots and matching axe JSON reports are in [`screenshots and reports`](../../ui/after/ai/phase14-grounded-assistant/). Axe ran against the assistant dialog; there were zero violations and zero horizontal overflows. One `color-contrast` result is incomplete because axe could not determine background colors while the dialog backdrop overlaps content in the dark desktop unavailable state. This requires manual contrast review; it is not counted as a pass. A prior whole-page scan also surfaced contrast findings in unrelated workspace activity text, so this report makes no claim about the entire app shell.
- Full frontend gates: `python3 tools/quality/gates.py frontend docs/quality/phase14-ai-assistant` — exit 0 for lint, formatting, strict types, full component/Node tests with coverage, and Next.js production build (`--webpack`) in the permitted subprocess context. The suite passed 9 Node tests and 34 component-test files / 173 tests.
- Coverage comparison: `node tools/ci/coverage.mjs frontend docs/quality/phase14-ai-assistant/frontend-coverage/coverage-summary.json docs/quality/phase14-inbox/frontend-coverage/coverage-summary.json` — exit 0. Statements 56.90%, branches 51.25%, functions 51.58%, lines 58.26%; all exceed the previous verified inbox increment. The first comparison after implementation exited 1; additional response/error regression tests were added before the final passing comparison.
- Pinned Semgrep TypeScript scan — exit 0, zero findings across 280 targets. Five partial-parsing warnings reference unchanged files under workspace/settings/snippets and the existing auth error boundary; the scan report is sanitized in `semgrep-redacted.json`.
- `git diff --check` — exit 0.

## Limits

Browser identities are local fixtures, not real Clerk acceptance. Grounded responses and the source-navigation response are intercepted fixtures, not a real model/provider evaluation or proof of factual accuracy. The viewer HTTP 403 is exercised against the isolated local backend. No real provider credentials were used. Manual screen-reader and contrast review remains outstanding. The legacy streaming Copilot remains unchanged and is not presented by this increment as the grounded preview's validated-citation channel.

The machine-readable gate, coverage, Semgrep and axe summaries are retained beside this record. Raw gate logs were not retained in the commit. No production data, provider configuration, API contract or feature flag was changed. Phase 14 remains in progress; no Phase 15 work started.
