# Runtime and Kanban follow-up

Only the two requested items on upgrade/enterprise. No push, deployment, paid API calls, Lighthouse or load testing. Tests, baseline images, tolerances and CI security gates are unchanged.

## Container comparison

[Current per-finding inventory](../../../VULNERABILITIES.md), [raw scan comparison](scan-comparison.json). Same Trivy0.68.2 vulnerability database, no severity filtering or suppression:

| Image    | Before C/H/M/L/U | Selected runtime C/H/M/L/U |
| -------- | ---------------- | -------------------------- |
| Backend  | 0/44/75/60/8     | 0/0/4/0/0                  |
| Frontend | 0/44/71/60/8     | 0/0/0/0/0                  |

Raw before JSON: backend-before.json/frontend-before.json; selected JSON: backend-candidate.json/frontend-final.json. The image IDs in those reports identify exact scanned artifacts. The latest supported Node22 Trixie tag still resolves to the old digest (trixie-pull.txt). The official Alpine variant was built for both applications; backend stable apk installs OpenSSL/CA. Both Dockerfiles pin the same manifest digest. Node documents musl's lower support tier; the inventory records that compatibility tradeoff. Only local amd64 is validated, not all architectures/hosts.

The standalone base scan alpine-base.json includes tooling/npm findings; npm/npx/Yarn are already excluded in runtime stages. Do not report the build/migration tooling image as having a clean scan. No Debian unstable packages, scanner ignores, VEX, gate exception or changed severity threshold. Remaining four backend Medium rows retain fixed versions and explicitly unverified reachability in the inventory.

Both candidates built. Frontend was rebuilt after the Kanban code correction; each build transcript remains. Exact final-image Compose result: [compose/result.json](compose/result.json),30.322 seconds with cache and concurrent local work. Migrations/seeds, API/frontend/worker UID1000, capability/no-new-privileges checks, liveness200, setup guidance, protected401, unconfigured readiness503 and one sample workspace pass. Initial candidate graph20.733s retained in compose-initial/. These are functional checks, not cold-cache benchmarks. The executable compose-test.py uses random projects/volumes and removes only its own disposable graph. No private environment is copied.

## Kanban reproduction and correction

core-before.txt:10 passed/1 failed(2.6m). The transient failure snapshot, read before the next Playwright run replaced test-results, showed the Move combobox expanded and a modal listbox active during drag. Playwright's initial pointer-down landed on the card's dropdown, making the destination inert; no move PATCH followed. This is a real interaction defect.

Application fix: keep the Move selector as a sibling outside the native draggable surface, retain keyboard controls and role/write guards, and populate the native transfer with the task ID. The drop still goes through the existing server API/current-authority policy. No server/client contract change. The first correction also made the title draggable and exposed a duplicate match; core-after.txt retains that10-pass/1-fail intermediate result. Removed the extra child draggable. Tests/selectors were never changed.

core-final.txt: **11 passed/0 failed(1.5m)**, including the exact original pointer-drag journey, server persistence assertion, snippet save/reload, viewer denial and invitation tests. No filter, skip, assertion removal or test rewrite.

## Required gates

Both sequences pass: lint, format, strict type-check, tests and production build. Backend28 suites/260 tests; frontend17 files/76 component tests plus9 Node tests. Commands/exits/timings and raw stdout/stderr are in gates/; orchestration stdout backend-gates.txt/frontend-gates.txt. Frontend statement/line coverage changes from41.19/41.67 to41.18/41.65 due the added, component-uncovered transfer assignment; branch/function percentages38.62/39.47 are unchanged. No coverage baseline or threshold was altered. Hosted coverage comparison was not executed.

## Shell visuals

The unchanged seven-test shell run and its screenshots/axe reports are retained in shell.txt and shell/. No snapshot-update flag was used. Final shell run:7 passed/0 failed(1.4m),40 unchanged screenshot comparisons;40 axe reports,0 violations,26 incomplete rule occurrences retained, not treated as passes. Per-case disposition is in PROGRESS and FINAL_REPORT. Earlier original triplet review remains in Phase5a-3/VISUAL_REVIEW.md; those historical accepted baseline updates are not repeated in this session.
