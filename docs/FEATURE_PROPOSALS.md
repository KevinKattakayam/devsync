# Phase 4a — research and feature proposals

Research date: 2026-11-02. **Proposals only; nothing in this document is implemented or approved for implementation.** This timeboxed pass prioritizes desk research, a complete candidate inventory and a security-filtered shortlist. No feature code, API change, deployment, user-content upload, interview, product trial or performance experiment was performed. Further interviews, hands-on competitive testing and implementation designs are deferred.

## Evidence and uncertainty

Sources are linked beside claims. Official documentation establishes advertised capabilities, not user satisfaction or independently audited security. Vendor-sponsored surveys have selection/commercial biases. Individual public posts show a problem exists for that author, not its prevalence. Historical findings are dated. All segment needs, impact scores, costs and differentiation judgments below are hypotheses unless explicitly attributed. Search results and accessible pages were reviewed; this is not an exhaustive market or patent search. No product is declared to lack a feature merely because its documentation was not found.

### What people report

| Pain                                             | Evidence reviewed                                                                                                                                                                                                                                                                                                                                                                                                                                | Implication, not a measured DevSync outcome                                                                         |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Finding information and context switching        | Atlassian's 2025 developer-experience report identifies information discovery and switching tools among reported time-wasters. Vendor-sponsored research, not a DevSync user study. [Report](https://www.atlassian.com/blog/developer/developer-experience-report-2025)                                                                                                                                                                          | Put source context beside work; avoid another dashboard requiring duplicate entry.                                  |
| Stale docs and onboarding                        | GitHub's **2017** Open Source Survey reports incomplete/outdated documentation and describes its importance to newcomers. It is historical evidence, not a current prevalence estimate. [Survey](https://opensourcesurvey.org/2017/)                                                                                                                                                                                                             | Give docs maintainers, evidence and review triggers; offer newcomer paths rather than auto-generated encyclopedias. |
| Change invalidates a spec before its review date | An individual Confluence user describes specs diverging after scope/status changes and questions age-only review reminders. Identity and incident are not independently verified. [First-person complaint](https://www.reddit.com/r/atlassian/comments/1uown9v/how_do_you_keep_confluence_pages_from_going_stale/)                                                                                                                               | Flag a specific dependency change for review; do not automatically assert the prose is false.                       |
| Offline preparation is tedious                   | A Notion community commenter reports having to download database content/subpages individually. Anecdote, not a reproducible assessment of today's entire product. [Discussion](https://www.reddit.com/r/Notion/comments/1murd6n/notion_finally_gets_offline_mode/)                                                                                                                                                                              | Show exactly what is available before disconnecting; no implicit promise that all linked content is cached.         |
| Lost decisions and tribal knowledge              | The GDS architecture-decision guidance recommends discoverable ADRs and following decisions through issues. This is practitioner guidance, not complaint-frequency data. [GDS](https://gds-way.digital.cabinet-office.gov.uk/standards/architecture-decisions.html)                                                                                                                                                                              | A decision needs an explicit acceptance/supersession record and links to implementation, not just an AI summary.    |
| Meetings and async handoffs                      | GitLab's communication handbook documents intentional async/sync practices; Atlassian's 2026 developer-experience report identifies continuing meeting/information friction. Organization practice plus vendor research, not proof every meeting should disappear. [GitLab](https://handbook.gitlab.com/handbook/communication/), [2026 report](https://www.atlassian.com/teams/software-development/state-of-developer-experience-2026)         | Trial concise, source-linked handoffs; keep escalation to a conversation.                                           |
| Code-review friction                             | GitHub Discussions supports answered questions and community decisions; Linear integrates PRs with work status. These demonstrate existing solutions, not the prevalence of reviewer frustration. Review-context reassembly remains an **unvalidated segment hypothesis** here. [GitHub](https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions), [Linear](https://linear.app/docs/github) | Validate what reviewers repeatedly ask before building another review UI.                                           |
| General developer friction                       | Stack Overflow's 2024 professional-developer results identify technical debt as a leading frustration. This does not demonstrate demand for any proposed feature. [Survey](https://survey.stackoverflow.co/2024/professional-developers)                                                                                                                                                                                                         | Favor maintaining existing knowledge over producing more unreviewed content.                                        |

### People and regions

The following translates evidence into hypotheses to validate; no segment was interviewed in this session.

| Segment                                                | Concrete scenario / pain hypothesis                                                                                                                                                                                                                                                                                                                                                                   | Appropriate boundary / validation question                                                                                                                                                 |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Solo developers                                        | Returning to a project after weeks, unable to recover why a tradeoff was made; repeating snippet lookup.                                                                                                                                                                                                                                                                                              | Personal decision receipts and exports first. Ask them to reconstruct one actual interrupted task. No requirement to adopt a team workflow.                                                |
| Student teams                                          | Semester turnover, unclear contribution/setup guidance, limited budget and a shared project vocabulary.                                                                                                                                                                                                                                                                                               | Small onboarding paths, plain-language glossary and reproducible handoff. Ask where last term's setup failed; do not equate low experience with inability.                                 |
| Startups                                               | Specs, PRs and tasks diverge while ownership changes quickly.                                                                                                                                                                                                                                                                                                                                         | Change-triggered review queue with an owner; do not add mandatory process to every commit. Ask for the last incorrect spec someone relied on.                                              |
| Open-source maintainers                                | Repeated newcomer questions and decisions spread across issue threads. Historical documentation evidence supports investigation. [2017 survey](https://opensourcesurvey.org/2017/)                                                                                                                                                                                                                    | Human-approved public summaries only; private maintainer notes cannot flow into a public reply. Ask which repeated question costs effort, without requesting private content.              |
| Distributed teams                                      | Another time zone inherits a task with status but no next step, reason or blocking question.                                                                                                                                                                                                                                                                                                          | Timestamped handoff + explicit acknowledgment. Validate whether this reduces clarification, not whether it increases activity counts.                                                      |
| Low-bandwidth/mobile users, including India            | A video-first explanation or large graph may be impractical on a particular connection/device. India's 2025 telecom survey measures household/mobile internet access and rural/urban differences; it does **not** measure developer workflow latency or prove unreliable access for every Indian user. [Government summary](https://www.pib.gov.in/Pressreleaseshare.aspx?PRID=2132330&lang=2&reg=48) | Text-first payloads, visible download sizes, explicit freshness. Recruit users with differing connections; measure actual transfer and task completion later.                              |
| Non-English collaboration, including Hindi/Tamil users | English terminology may obscure a handoff even when code identifiers are understood. The historical open-source survey reports variation in English proficiency, not India-specific language preferences. [Survey](https://opensourcesurvey.org/2017/)                                                                                                                                                | Preserve original + human-reviewed translation/glossary, Unicode/IME support, no forced translation of identifiers. Ask preferred language/script; never infer it from location or a name. |

## Competitive review — all requested products

This is a capability comparison, not a benchmark. Capabilities/terms can change after the research date. Height's primary site timed out; its status is explicitly secondary-sourced. Proprietary integrations are optional dependencies, not open-source substitutes.

| Product            | Observed overlap and lesson for DevSync                                                                                                                                                                                                                                                                                                                    |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Notion             | Managed sync brings GitHub PRs/issues into databases. Offline pages already exist with documented download limits. Live links and offline access are not novel by themselves. [Sync](https://www.notion.com/help/sync-data-from-other-tools-to-notion), [Offline](https://www.notion.com/en-gb/help/use-pages-offline)                                     |
| Linear             | Links GitHub PRs, automates statuses and syncs issues; project documents support references. Avoid claiming linked tasks/docs are new. [GitHub](https://linear.app/docs/github), [Documents](https://linear.app/docs/documents)                                                                                                                            |
| Slack              | Free-workspace history access and retention are constrained: official documentation describes90-day visibility and data older than a year being deleted. Durable approved decisions should not depend solely on searchable chat. [Limits](https://slack.com/help/articles/115002422943-Usage-limits-for-free-workspaces)                                   |
| GitHub             | Discussions supports project decisions, questions and marked answers. DevSync should link back to these records rather than duplicate ownership of the conversation. [Discussions](https://docs.github.com/en/discussions/collaborating-with-your-community-using-discussions/about-discussions)                                                           |
| Confluence         | Atlassian's 2024 announcement describes verified-page status. Verification/review badges are established; dependency-triggered evidence is the proposed refinement. Current plan availability was not verified. [Announcement](https://community.atlassian.com/t5/Confluence-articles/Verified-Pages-Now-Available-in-Confluence/ba-p/2664827)             |
| Coda               | Pack sync tables include selected two-way integrations, including GitHub. Data sync is established and carries connection/permission maintenance costs. [Pack tables](https://help.coda.io/hc/en-us/articles/39555773352461-Sync-data-with-Pack-tables)                                                                                                    |
| Obsidian           | Local Markdown vaults and backlinks make portability and linked knowledge familiar, not original DevSync inventions. [Storage](https://obsidian.md/help/Files%2Band%2Bfolders/How%2BObsidian%2Bstores%2Bdata), [Backlinks](https://obsidian.md/help/plugins/backlinks)                                                                                     |
| Cursor             | Codebase indexing and a privacy mode are documented. Privacy mode and fully local processing are different questions; never assume no-training means no content transmission. [Indexing](https://prod.cursor.com/blog/secure-codebase-indexing), [Privacy](https://prod.cursor.com/help/security-and-privacy/privacy)                                      |
| Warp               | Warp Drive saves/shares workflows and notebooks; notebooks can contain runnable commands. Reusable runbooks exist, but DevSync should initially keep explanations non-executing. [Drive](https://docs.warp.dev/knowledge-and-collaboration/warp-drive), [Notebooks](https://docs.warp.dev/knowledge-and-collaboration/warp-drive/notebooks/)               |
| Pieces             | PiecesOS and Long-Term Memory capture/store workflow context on-device and expose integrations. Workspace memory is not new; explicit resource selection and tenant authorization should be DevSync's boundary. [PiecesOS](https://docs.pieces.app/products/core-dependencies/pieces-os), [MCP](https://docs.pieces.app/products/mcp)                      |
| Excalidraw         | MIT-licensed whiteboard with open drawing export; repository describes collaborative/E2E-encrypted functionality. Embedding its editor would not automatically give DevSync that encryption architecture. [Repository](https://github.com/excalidraw/excalidraw)                                                                                           |
| Loom               | Async video and transcripts already address some meeting needs. Atlassian documents a Starter role's25-video recording/editing allowance; plan details must be checked before dependency decisions. [Workspace guide](https://www.atlassian.com/software/loom/resources/guides/managing-your-loom-workspace-and-content)                                   |
| VS Code Live Share | Read-only collaboration exists, but debugging/terminal/server access has additional exposure. Do not recreate remote execution casually. [Security](https://learn.microsoft.com/en-ca/visualstudio/liveshare/reference/security)                                                                                                                           |
| Raycast            | Searchable/shared snippets, expansion and duplicate skipping on import already exist. Novelty must come from safe provenance/use relationships, not a copy button. [Snippets](https://www.raycast.com/core-features/snippets)                                                                                                                              |
| Height             | Historical tasks/chat/autonomous project-management reference. A March2025 report describes a September24,2025 service shutdown; primary site unavailable in this pass. Treat shutdown as secondary evidence, not proof of its cause or that a feature category failed. [Contemporaneous report](https://www.creativerly.com/height-app-is-shutting-down/) |
| Plane              | Work items, wiki/pages and integrations already coexist; Community edition is AGPLv3 and commercial editions differ. Self-hosting is not zero-cost operation or automatic paid-feature parity. [Docs](https://docs.plane.so/), [Editions](https://developers.plane.so/self-hosting/editions-and-versions)                                                  |
| AppFlowy           | Open-source collaborative workspace; main repository identifies AGPL3 and desktop/mobile clients. Do not infer every hosted/backend component has identical licensing or operational requirements. [Repository](https://github.com/AppFlowy-IO/AppFlowy)                                                                                                   |

## DevSync reuse inventory and delivery assumptions

Current status comes from [PROGRESS](PROGRESS.md) and [AUTHZ_MATRIX](AUTHZ_MATRIX.md). [ARCHITECTURE_CURRENT](ARCHITECTURE_CURRENT.md) explicitly marks itself as a historical snapshot; do not treat its older limitations as the current implementation.

Reuse abbreviations for the catalog:

- **D:** TipTap documents, Yjs/Hocuspocus, journal/snapshots and existing local store. These are not a complete offline/PWA product or public snapshot-history UI.
- **T:** boards/tasks, priority/date/assignee models and central task policy. Whole-board local state still has concurrency limits; no assumption of task-level CRDT ordering.
- **S:** snippets and central workspace/resource policy; host execution stays disabled.
- **A:** actual activity records, workspace members and shell navigation; not a guaranteed delivery outbox or worker SLA.
- **G:** existing GitHub repository configuration/signed webhook/PR processing; not already a general GitHub file-sync or GitLab connector.
- **Q:** pgvector retrieval/embedding outbox, editor SSE and numbered candidate references. No claim-level citation proof, accurate atomic user/workspace quotas or complete eval harness.
- **P:** central authorization, tenant RLS, membership/invitation consent, resource binding, revocation and versioned API aliases. Custom roles/SSO/public access need explicit new authority design.

Effort **S** = one bounded module; **M** = several modules/new persisted relationships; **L** = authority/integration/offline architecture or substantial new service. These are relative estimates assuming experienced maintainers and prerequisites, not dates or staffing promises. Impact H/M/L is hypothesized reduction of a specific problem, not measured adoption or revenue. Hosting/storage/support always have costs; “no provider fee” does not mean a free production deployment.

All acceptable variants require P at request, background work and disclosure; derived material inherits source authority. New DTOs/endpoints require versioning. No user content may train shared models. Optional AI requires explicit opt-in, no-training/retention terms and quota/cancellation prerequisites; otherwise use deterministic/manual workflows. Source display must not reveal even private titles through counts, links, caches or search suggestions.

## Candidate catalog — 32 ideas

### P01 — Code-change review receipts

- **Problem / people:** Startup/OSS docs remain trusted after linked implementation changes. Link a GitHub file, PR, issue or commit and place affected docs into a human review queue.
- **Novelty:** Live embeds/status overlap Notion/Linear/Coda. Proposed difference is a receipt recording pinned code revision, changed dependency and human review outcome; changed code means “review needed,” not “doc false.”
- **Reuse / effort / impact:** D+G+A+P; **M / H**.
- **Risk:** Private repository metadata leakage, webhook replay and renames. Allowlist GitHub APIs; repository access must intersect workspace access; no arbitrary URL fetching.
- **Dependencies / cost:** GitHub App read scopes, signatures, conditional fetches and new link/receipt schema. API-rate/retention budgets; manual SHA attachment works without a paid integration. GitHub limits are authentication-specific. [Rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)

### P02 — Decision receipts and supersession

- **Problem / people:** Solo/startup/distributed developers lose the reason behind tasks. Extract or manually nominate decisions from docs/tasks and, once available, comments; an owner accepts an ADR and superseding links.
- **Novelty:** ADRs and GitHub decisions are established. A cited source revision plus accepted/superseded receipt is the proposed DevSync combination, not autonomous decision-making. [GDS guidance](https://gds-way.digital.cabinet-office.gov.uk/standards/architecture-decisions.html)
- **Reuse / effort / impact:** D+T+A+P; **M / H**.
- **Risk:** Misrepresenting agreement; excerpt disclosure. No inferred acceptance, retroactive authorship or cross-workspace rollup.
- **Dependencies / cost:** New decision/link records; manual templates first, no model fee. AI extraction and comment ingestion wait for Q safeguards/comment support.

### P03 — Permission-aware cited workspace memory

- **Problem / people:** Teams repeatedly search docs/snippets/tasks for context.
- **Novelty:** Existing Q and Pieces/Cursor overlap heavily. Proposed improvement is live authority rechecks, source IDs/revisions and explicit unsupported-answer behavior, not generic “chat with docs.”
- **Reuse / effort / impact:** Q+D+S+T+P; **L / H**.
- **Risk:** Retrieval/prompt injection, revoked-source cache leaks and hallucinations. Never search another workspace; recheck before provider disclosure and answer display.
- **Dependencies / cost:** Versioned citation DTO, quota ledger, eval corpus consent, embedding/inference budget. PostgreSQL lexical fallback avoids paid inference; generative mode is not free by assumption.

### P04 — Snippet safety preflight

- **Problem / people:** Students, solo developers and maintainers paste credentials with reusable code. Before saving, show redacted suspicious spans and explicit remediation.
- **Novelty:** Secret scanning is established. Proposed difference is save-time, tenant-local review paired with snippet provenance, before indexing/export; not a claim of perfect detection.
- **Reuse / effort / impact:** S+P+Q ingestion boundary; **M / H**.
- **Risk:** Logging matches or false reassurance. Both trusted server checks and local preview; bounded rules; no raw values in logs, telemetry or error messages.
- **Dependencies / cost:** Review pinned detector rules/licences; Gitleaks is MIT, but executable/rules packaging must be assessed separately. No snippet execution or external validation calls. No provider quota. [Gitleaks](https://github.com/gitleaks/gitleaks)

### P05 — Snippet dedupe, tags and “used in” links

- **Problem / people:** Solo/student teams accumulate near-identical snippets with unclear origins.
- **Novelty:** Raycast already skips exact import duplicates. Add explicit usage links to DevSync docs/tasks; similarity suggestions remain advisory.
- **Reuse / effort / impact:** S+D+T+P; **M / M**.
- **Risk:** Inferring use from unrelated text or exposing duplicates across tenants. Scope hashes/indexes to workspace; no auto-merge.
- **Dependencies / cost:** Normalization/tag/link schema, bounded comparisons; optional Q later. No external API required; storage/index costs remain.

### P06 — Evidence-only async digest

- **Problem / people:** Distributed/startup teams repeat status meetings because changes lack handoff context.
- **Novelty:** Digests are conventional. Proposed distinction is a deterministic, permission-filtered list of real events with source revisions, missing-data labels and a human next-step field; no synthetic accomplishments.
- **Reuse / effort / impact:** A+T+D+P; **M / H**.
- **Risk:** Surveillance or disclosures to removed recipients. Opt-in audience, no individual productivity score, authorization at generation and send/open.
- **Dependencies / cost:** Delivery cursor/deduplication and retention design. In-app first has no messaging fee; email/chat later adds delivery/provider limits.

### P07 — Transcript-to-task review inbox

- **Problem / people:** Teams leave meetings with unassigned actions.
- **Novelty:** Loom already offers transcripts; extraction is not novel. Source timestamp and explicit participant approval could improve accountability.
- **Reuse / effort / impact:** D+T+Q+P; **L / M**.
- **Risk:** Recording consent, sensitive speech, wrong assignees and model injection. Upload only with permission; suggested tasks never auto-create/assign.
- **Dependencies / cost:** Transcript import/storage first; local transcription needs compute/model-licence review, hosted transcription incurs costs. No unlimited free speech service assumed.

### P08 — Maintainer-approved onboarding paths

- **Problem / people:** New student/OSS/startup contributors cannot find the minimum setup and rationale.
- **Novelty:** Wikis/checklists are established. Proposed path pins prerequisite docs, accepted decisions and review freshness; it warns when a prerequisite changes.
- **Reuse / effort / impact:** D+T+A+P; **M / H**.
- **Risk:** Showing private steps, stale setup or tracking learners unfairly. Personal completion private by default; no employment/performance ranking.
- **Dependencies / cost:** Path/revision links and freshness receipts; manual curation before AI. No paid provider; multilingual copies need human review.

### P09 — Task-linked focus timer

- **Problem / people:** Solo developers restart work without a clear next action.
- **Novelty:** Timers/focus mode are not original; reuse the shell rather than invent another productivity suite.
- **Reuse / effort / impact:** T+shell; **S / M**.
- **Risk:** Covert monitoring or inaccurate timesheets. Local opt-in timer; never equate elapsed time with contribution.
- **Dependencies / cost:** Browser visibility/persistence and accessible controls; no external API, paid plan or background-time guarantees.

### P10 — Source-linked graph with list alternative

- **Problem / people:** Maintainers cannot see how a task, ADR, doc, snippet and PR relate.
- **Novelty:** Obsidian already has backlinks/graph-oriented metadata. Proposed difference is typed, revision-aware operational links, not a generic force graph.
- **Reuse / effort / impact:** D+S+T+G+P; **M / M**.
- **Risk:** Hidden-node existence/count leakage and inaccessible diagrams. Filter edges server-side; equivalent keyboard list.
- **Dependencies / cost:** Typed links and bounded graph queries; browser SVG first, no paid graph service. Large-workspace performance is unmeasured.

### P11 — Narrow integration adapters

- **Problem / people:** Teams copy context among GitHub, GitLab, Slack, Discord and VS Code.
- **Novelty:** Integrations are conventional. Differentiate on explicit user-selected capture with source/permission receipts, not indiscriminate ingestion.
- **Reuse / effort / impact:** G+A+D+P; **L / H**.
- **Risk:** Overscoped tokens, channel/repo ACL mismatch, SSRF and message duplication. One workspace/installation binding; no DMs by default.
- **Dependencies / cost:** Separate OAuth/App/extension approvals per platform; API terms/rate limits and revocation lifecycle. Slack history access has special limits; GitLab/Discord/VS Code terms not fully reviewed here, so no free-tier guarantees. [Slack limits](https://docs.slack.dev/apis/web-api/rate-limits/)

### P12 — Scoped public API and webhooks

- **Problem / people:** Startups/OSS teams need automation without a browser session.
- **Novelty:** Commodity capability; no novelty claim.
- **Reuse / effort / impact:** P+existing versioned REST+A; **L / H**.
- **Risk:** Long-lived credential misuse, replay, outbound SSRF and confused deputies. Short scopes, revocation, signed events and destination validation.
- **Dependencies / cost:** Versioned contracts, service authority model, token store/audit and durable delivery outbox. Hosting/egress/retry costs; no third-party subscription required.

### P13 — Expiring public read-only snapshots

- **Problem / people:** Maintainers/startups want to share selected context with outsiders.
- **Novelty:** Share links/passwords are common. Explicit reviewed snapshot selection could reduce accidental exposure.
- **Reuse / effort / impact:** D+P; **L / H**.
- **Risk:** Password/link leakage, transitive private backlinks, indexed previews. Exported public snapshot must omit private relations and support revocation; password is not workspace membership.
- **Dependencies / cost:** New versioned public authority, hashed passwords, expiry, throttling, audit and cache controls. No provider fee; bandwidth and abuse handling cost money. Blocked pending security design.

### P14 — Verified portable export bundle

- **Problem / people:** Solo/student/OSS users fear losing decisions or being locked into a service.
- **Novelty:** Markdown/PDF export is not new. Proposed bundle includes current canonical revisions, source links, unavailable-reference warnings and a readable manifest; it never invents a complete backup.
- **Reuse / effort / impact:** D+S+T+P+journal; **M / H**.
- **Risk:** Exports outlive revocation, embedded secrets and archive traversal. Explicit selection/confirmation, secret preflight and safe paths; no automatic email upload.
- **Dependencies / cost:** Schema-aware serializers; Markdown first, browser print-to-PDF later. No paid converter; inspect renderer/font licences if server PDF is later chosen. Download/storage limits apply.

### P15 — Markdown/Notion import staging

- **Problem / people:** Students/startups have existing notes and cannot re-enter everything.
- **Novelty:** Standard migration feature. Preview unsupported blocks and provenance rather than promise perfect fidelity.
- **Reuse / effort / impact:** D+existing ingestion+P; **M / M**.
- **Risk:** Malicious HTML/URLs, huge archives, private copied data and mistaken permissions. Bounded staging, no remote embeds, confirm destination.
- **Dependencies / cost:** Export-format/Notion API and licence review; versioned batch contracts. Manual Markdown avoids API quota; API limits and conversion fidelity remain unverified.

### P16 — Custom roles, guests and SSO-ready authority

- **Problem / people:** Startups need contractors to see only appropriate material.
- **Novelty:** Established enterprise access control, not differentiation.
- **Reuse / effort / impact:** P+Clerk/membership/invitations; **L / H**.
- **Risk:** Privilege escalation, stale grants, JIT/SCIM identity confusion and owner lockout. New roles cannot bypass existing central checks/RLS/revocation.
- **Dependencies / cost:** Formal policy model, migration, provider mapping and versioned contracts. Paid identity-provider entitlements may be needed; free-tier SSO is not assumed. Blocked pending authority design.

### P17 — Diagram-linked decision sketch

- **Problem / people:** Distributed/student teams need visual rationale without a live meeting.
- **Novelty:** Excalidraw already solves sketching. New value would be a sketch pinned to an accepted decision/source revision.
- **Reuse / effort / impact:** D+P; **M / M**.
- **Risk:** Scripted SVG/imports, external assets, access mismatch. Sanitize/export static first; do not claim inherited E2E encryption.
- **Dependencies / cost:** MIT Excalidraw library/open JSON, dependency/asset review and storage limits; no paid diagram API required. [Repository](https://github.com/excalidraw/excalidraw)

### P18 — Reviewer context packet

- **Problem / people:** OSS/startup reviewers ask repeatedly for intent, related decisions and test evidence.
- **Novelty:** PR templates and Linear links already exist. Proposed packet is a permission-filtered, version-pinned reading list, not an automated review verdict.
- **Reuse / effort / impact:** G+D+T+A+P; **M / H**.
- **Risk:** Private design notes in public PRs or unsupported test claims. Preview intended audience; use only actual linked evidence, human publish step.
- **Dependencies / cost:** P01/P02 relationships; manual copy first, GitHub posting requires API scopes/limits. No inference fee required.

### P19 — Text-first handoff delta

- **Problem / people:** Distributed/mobile users need the important changes and next question without downloading a recording or a large graph.
- **Novelty:** Async notes are common. Proposed combination is a text-budgeted delta since an acknowledged revision, with omitted/stale data called out and original-language text preserved.
- **Reuse / effort / impact:** A+D+T+P; **M / H**.
- **Risk:** Handoff viewed after revocation, silent omissions, duplicated tasks. Reauthorize every resource; never auto-close tasks on acknowledgment.
- **Dependencies / cost:** Per-recipient cursor and source links, deterministic renderer. No video/translation/LLM provider; use actual byte sizes rather than invented “low data” metrics. Not a PWA/offline-all-content promise.

### P20 — Human-reviewed bilingual glossary

- **Problem / people:** Non-English teams lose meaning when prose translations change code identifiers or domain terms.
- **Novelty:** Glossaries/localization are established; binding terms to source decisions may help.
- **Reuse / effort / impact:** D+S+search+P; **M / M**.
- **Risk:** Mistranslation, sensitive terms sent to cloud services. Original retained; human review; identifiers not automatically translated.
- **Dependencies / cost:** Unicode/IME/accessibility QA and translation ownership. Manual English/Hindi/Tamil glossary first; no assumed free translation API. Language choice is user supplied.

### P21 — Personal resume-work receipt

- **Problem / people:** Solo/distributed developers lose their next step after interruption.
- **Novelty:** Pieces captures broader workflow history; proposed version stores only explicitly chosen DevSync links, current question and cursor, not background surveillance.
- **Reuse / effort / impact:** D+T+shell+P; **M / M**.
- **Risk:** Private personal notes becoming team activity. Private by default, explicit share, account-bound local storage and revocation behavior.
- **Dependencies / cost:** New personal-state authority/store; no external model or OS-capture agent; local storage is not an encrypted backup guarantee.

### P22 — Maintainer documentation-gap inbox

- **Problem / people:** OSS maintainers answer the same setup questions without improving docs.
- **Novelty:** Answered discussions exist. Proposed improvement links repeated questions to a specific missing or stale onboarding step, with human triage.
- **Reuse / effort / impact:** D+T+A+P; **M / H**.
- **Risk:** Harassing newcomers, inferred duplicate errors or leaking private questions. No public user ranking; confirm duplicates before merging.
- **Dependencies / cost:** P08/source links; manual nomination first, optional GitHub ingestion has API budget. No paid clustering needed for MVP.

### P23 — Notification budget with escalation

- **Problem / people:** Distributed contributors mute a noisy workspace and miss a blocker.
- **Novelty:** Quiet hours/digests are conventional. Distinguish user-controlled blocker escalation from activity spam.
- **Reuse / effort / impact:** A+T+P; **M / M**.
- **Risk:** Missing urgent information or exposing availability. Opt-in policy, preview and explicit escalation; no presence-based surveillance.
- **Dependencies / cost:** Time-zone/locale QA, delivery cursors and durable notifications. In-app first; email/chat delivery incurs provider/abuse limits.

### P24 — Evidence-linked task acceptance

- **Problem / people:** Startup/student tasks become “done” without a usable explanation or verification record.
- **Novelty:** Checklists are commonplace. Proposed acceptance receipt links an actual doc revision, snippet/PR and human verification note, recording “not supplied” rather than invented tests.
- **Reuse / effort / impact:** T+D+S+G+P; **M / H**.
- **Risk:** False compliance, external evidence leaks and overly rigid workflows. Optional template, immutable human authorship and audience-aware links; never auto-approve.
- **Dependencies / cost:** New receipt/link schema and canonical revisions. Manual references need no provider fee; CI ingestion is a separate integration and cannot be assumed present.

### P25 — Bounded help-session context

- **Problem / people:** Students/OSS contributors cannot reproduce an issue for a remote helper.
- **Novelty:** Live Share is much richer already. Safer proposed scope is a selected read-only text packet and question, not terminal sharing.
- **Reuse / effort / impact:** D+S+P; **L / M**.
- **Risk:** Secrets in environment output, temporary grants and debugging access. No command execution, port tunnel or credential capture.
- **Dependencies / cost:** Redaction/guest authority design, explicit selection, expiry and approval. Static export fallback avoids paid session infrastructure.

### P26 — Honest AI allowance and disclosure preview

- **Problem / people:** Budget-constrained teams cannot tell what a model call costs or sees.
- **Novelty:** Quota displays are conventional; accurate reservations plus source-disclosure preview are foundational trust work.
- **Reuse / effort / impact:** Q+P+billing; **L / H**.
- **Risk:** Overspend, secret prompts and misleading estimates. Separate estimated from settled usage; fail closed on limits; redact logs.
- **Dependencies / cost:** Attributed atomic quota ledger and versioned usage contract, cancellation/reconciliation, provider terms and pricing review. Local/manual workflows must remain available; free provider tiers are not an SLA.

### P27 — Release evidence brief

- **Problem / people:** Maintainers/startups reconstruct a release from scattered work.
- **Novelty:** Changelog tooling exists. Proposed brief shows real merged changes and unresolved acceptance/doc-review items, not marketing prose invented by AI.
- **Reuse / effort / impact:** G+T+D+A+P; **M / M**.
- **Risk:** Publishing private issues, claiming tests that were not run. Human approval, source links and public audience filtering.
- **Dependencies / cost:** P01/P24, GitHub tag/PR APIs and rate budget. Deterministic text first, no paid model requirement.

### P28 — Always-on cross-application capture

- **Problem / people:** A broad memory could reduce context reconstruction.
- **Novelty:** Pieces already explores this space. **Reject the unconsented always-on variant**, not a claim the comparator is unsafe.
- **Reuse / effort / impact:** Q+personal memory; **L / uncertain H**.
- **Risk:** Captures another employer/workspace, DMs and credentials; cannot infer consent from app focus. Incompatible with this project's explicit resource boundary.
- **Dependencies / cost:** OS agents, capture consent and retention models far beyond current modules. No acceptable free/secure MVP for this variant; replace with P21's explicit capture.

### P29 — Global cross-workspace semantic index

- **Problem / people:** Global search might find more answers for consultants on several projects.
- **Novelty:** Enterprise search is established. **Reject a shared index/answer that mixes workspace contents.**
- **Reuse / effort / impact:** Q; **L / hypothesized H**.
- **Risk:** Cross-tenant retrieval, titles/embeddings/cache leakage and confused authority; directly violates scope even if a user belongs to both workspaces.
- **Dependencies / cost:** No acceptable implementation as defined. A future explicit workspace switch querying each isolated authority is a different proposal, not an exception.

### P30 — Shared model trained on workspace content

- **Problem / people:** A provider might promise more tailored answers for everyone.
- **Novelty:** Fine-tuning is established. **Reject training on user content**, including “anonymized” snippets in a shared corpus.
- **Reuse / effort / impact:** Q; **L / unvalidated**.
- **Risk:** Memorization, licence/consent ambiguity and inability to honor deletion/revocation. Incompatible with the user's requirement.
- **Dependencies / cost:** Training compute, corpus rights and leakage evaluation do not make it acceptable. Use retrieval over authorized resources without training instead.

### P31 — Explicit recent-doc offline pack

- **Problem / people:** Mobile/student/distributed users need to know what will open when disconnected.
- **Novelty:** Notion offline pages and Obsidian local files already exist. Proposed pack exposes exact resources, revision, bytes and pending-sync state.
- **Reuse / effort / impact:** D+existing IndexedDB+P; **L / H**.
- **Risk:** Revoked content retained offline, shared-device leakage and cache confusion. Define offline authority lease/logout purge limits honestly; never promise remote erasure of an offline copy.
- **Dependencies / cost:** Pending Phase3e PWA/service-worker/auth-cache design, storage quotas and multi-account/reconnect tests. No paid API, but substantial browser/device QA.

### P32 — Knowledge stewardship queue

- **Problem / people:** Startup/OSS teams cannot find who can review an abandoned runbook.
- **Novelty:** Confluence ownership/verification overlaps. Link review requests to human-maintained stewardship and handover receipts rather than guessing expertise from activity.
- **Reuse / effort / impact:** D+A+members+P; **M / M**.
- **Risk:** Employee ranking, implied availability or stale/departed owner. Voluntary ownership, reassignment and no “bus factor” score of individuals.
- **Dependencies / cost:** New stewardship/review records, member departure events and reminders. No paid model; notification delivery costs later.

## Ranking and selection

Scores are **subjective design judgments, not observed metrics or market forecasts**. Scale1–5: impact (a bounded problem matters), feasibility (higher = simpler given current gaps), novelty (differentiated combination, not world-first), safety (higher = smaller manageable exposure) and reuse (higher = more existing modules). Equal-weight total is their sum, maximum25. This deliberately gives safety an independent veto: a high impact cannot rescue a prohibited design. Ties are ordered by ID, not by claimed precision. Effort measures full delivery while feasibility also considers a bounded MVP, so a medium idea can have a feasible manual first slice.

| Rank | ID  | Impact | Feasibility | Novelty | Safety | Reuse | Total | Disposition       |
| ---- | --- | ------ | ----------- | ------- | ------ | ----- | ----- | ----------------- |
| 1    | P02 | 5      | 4           | 4       | 5      | 5     | 23    | Select            |
| 2    | P01 | 5      | 4           | 4       | 4      | 5     | 22    | Select            |
| 3    | P04 | 5      | 4           | 3       | 5      | 5     | 22    | Select            |
| 4    | P06 | 4      | 5           | 3       | 5      | 5     | 22    | Select            |
| 5    | P08 | 4      | 4           | 4       | 5      | 5     | 22    | Select            |
| 6    | P14 | 4      | 5           | 3       | 5      | 5     | 22    | Select            |
| 7    | P24 | 4      | 4           | 4       | 5      | 5     | 22    | Select            |
| 8    | P19 | 5      | 3           | 4       | 4      | 5     | 21    | Select            |
| 9    | P05 | 3      | 5           | 2       | 5      | 5     | 20    | Defer             |
| 10   | P22 | 4      | 4           | 3       | 4      | 5     | 20    | Defer             |
| 11   | P32 | 4      | 4           | 3       | 4      | 5     | 20    | Defer             |
| 12   | P18 | 4      | 4           | 3       | 4      | 4     | 19    | Defer             |
| 13   | P20 | 4      | 4           | 3       | 4      | 4     | 19    | Defer             |
| 14   | P27 | 4      | 4           | 2       | 4      | 5     | 19    | Defer             |
| 15   | P09 | 3      | 5           | 1       | 5      | 4     | 18    | Defer             |
| 16   | P21 | 4      | 3           | 4       | 3      | 4     | 18    | Defer             |
| 17   | P23 | 3      | 4           | 2       | 5      | 4     | 18    | Defer             |
| 18   | P03 | 5      | 2           | 2       | 3      | 5     | 17    | Defer             |
| 19   | P10 | 3      | 3           | 2       | 4      | 5     | 17    | Defer             |
| 20   | P26 | 5      | 2           | 2       | 4      | 4     | 17    | Defer             |
| 21   | P12 | 4      | 3           | 1       | 3      | 4     | 15    | Defer             |
| 22   | P31 | 4      | 2           | 2       | 2      | 5     | 15    | Defer             |
| 23   | P07 | 4      | 2           | 2       | 3      | 3     | 14    | Defer             |
| 24   | P15 | 3      | 3           | 1       | 3      | 4     | 14    | Defer             |
| 25   | P11 | 4      | 2           | 1       | 3      | 3     | 13    | Defer             |
| 26   | P17 | 3      | 3           | 1       | 3      | 3     | 13    | Defer             |
| 27   | P13 | 4      | 2           | 1       | 2      | 3     | 12    | Defer             |
| 28   | P16 | 4      | 1           | 1       | 3      | 3     | 12    | Defer             |
| 29   | P25 | 3      | 2           | 2       | 2      | 3     | 12    | Defer             |
| 30   | P28 | 4      | 1           | 2       | 1      | 2     | 10    | Reject as defined |
| 31   | P29 | 5      | 1           | 1       | 1      | 2     | 10    | Reject as defined |
| 32   | P30 | 4      | 1           | 1       | 1      | 2     | 9     | Reject as defined |

### Eight selected proposals — staged discovery, not permission to build

The top eight combine verifiable evidence, consent and revision-aware handoff rather than competing on another generic editor/chat/board. Their originality is the proposed interaction between DevSync resources; no exclusivity or absence elsewhere is asserted. They can start with deterministic/manual workflows and free/open libraries, without training or paying a model provider. P01 optionally uses a proprietary GitHub service within its documented API budget; a manual revision receipt is the free/local first slice. All require operating infrastructure and engineering work.

| Selected                        | First useful, bounded scope                                                                                               | Why selected / distinctive combination                                                                                                              | Dependencies and stop condition                                                                                                                                 | Future validation, no invented result                                                                                                                                               |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P02 Decision receipts           | Manually nominate a decision, quote authorized source revision, record owner acceptance and supersession.                 | Highest total; makes the “why” inspectable and preserves disagreement without pretending AI consent.                                                | P source checks plus new receipt schema. Stop if an excerpt loses its authority or acceptance is implicit.                                                      | Ask a developer to reconstruct a real decision from its receipt; record gaps and corrections.                                                                                       |
| P01 Code-change review receipts | Manual source SHA/PR link and diff-triggered review request; optional repository-scoped GitHub App later.                 | Event evidence addresses the complaint that age alone is a poor freshness proxy.                                                                    | P02/source-link schema, verified webhook installation/identity and deletion/rename handling. Stop if GitHub access cannot be intersected with workspace access. | Have a maintainer explain why a real doc was flagged; inspect false alarms and missing links.                                                                                       |
| P04 Snippet safety preflight    | Bounded local preview plus server check before storing/indexing; redact suspicious spans.                                 | Direct safety improvement using established scanning instead of executing or uploading snippets.                                                    | P/S, rule licence review, false-positive handling and safe telemetry. Stop if raw matches enter logs.                                                           | Use public synthetic scanner test cases later, never real credentials; assess misses/false positives without calling it proof of safety. No cases created in this research session. |
| P06 Evidence-only async digest  | In-app chronological change list with authorized links and an explicitly human-authored next question.                    | Achievable without AI or external messaging; no invented achievements or individual productivity scores.                                            | Reliable event/delivery cursor and reauthorization. Stop if events are incomplete but summary claims completeness.                                              | Compare a real handoff conversation with and without the digest; ask what still required clarification.                                                                             |
| P08 Onboarding paths            | A maintainer chooses a small path through setup docs and accepted decisions; revisions/freshness visible.                 | Combines learning order with evidence validity instead of generating another long wiki.                                                             | P02/P01/link model; no automatic publishing or progress leaderboard.                                                                                            | Observe a newcomer completing setup with consent; note confusing steps and missing permissions, not a promised onboarding-time reduction.                                           |
| P14 Verified portable export    | User-selected Markdown bundle, safe paths and canonical revision/source manifest.                                         | Reduces lock-in with inspectable omissions and provenance; ordinary export alone is not differentiated.                                             | P04 preflight, canonical serializer and explicit export selection. Stop if an export implies complete backup or includes hidden relations.                      | Have a user reopen it in a plain editor and explain missing/available references; later assess format fidelity.                                                                     |
| P24 Evidence-linked acceptance  | Optional task receipt points to actual review/test/doc evidence; “not supplied” is valid.                                 | Reuses task/docs/PR relationships to make done understandable without fabricated compliance.                                                        | P02 link/receipt authority and human acceptance; no automatic CI claims.                                                                                        | Review a completed task after a delay; ask whether its evidence answers the verifier's questions.                                                                                   |
| P19 Text-first handoff delta    | Render authorized changes since acknowledgment plus next question within an explicit text budget; original text retained. | Targets differing connections/time zones without assuming everyone needs video or a model; combines acknowledgment, omission and freshness signals. | P06 cursor, authority and human-language review; no full offline guarantee.                                                                                     | Recruit mixed-connection and Hindi/Tamil/English-preference participants; measure actual transfer later and observe whether meaning survives.                                       |

Tie-breaking rationale: P05/P22/P32 are useful but overlap existing patterns or depend on selected paths. P03 has high potential but the known quota/citation/retention gaps make an AI-first promise premature. P26 has a lower novelty score but is a **mandatory prerequisite before any paid/hosted generative expansion**, not optional because it missed the shortlist. Likewise P12/P16 authority work is prerequisite to privileged integration/guest designs. No ranked feature outranks repairing an existing security defect.

### Non-negotiable rejection and release gates

Reject P28's unconsented capture, P29's mixed-workspace index/answers and P30's training on user content. Higher relevance, an “anonymization” claim, user membership in multiple workspaces or a free provider tier cannot waive these requirements. Reject unsafe variants of other ideas too: automatically publishing private decision extracts, executing snippets/transcript commands, fetching arbitrary embed URLs, ranking workers from activity, or auto-accepting generated tasks/ADRs. These variants are not silently included in selected MVPs.

For a future acceptable implementation, require a written threat model covering current membership, source/repository intersection, derivative/cached authority, job rechecks, revocation, export permanence and no-training/retention terms. Test denied actor/foreign workspace, source deletion/archive, stale revision and replay across both REST and background paths. Human acceptance remains mandatory where a system would otherwise imply a decision, factual verification or consent. These are proposed future criteria; none was tested or built in Phase4a.

### Dependency and cost ledger

- **GitHub:** optional App, per-installation/repository read access, version-pinned API, conditional requests, quotas/backoff and verified delivery. Public/API access is not a licence to republish repository code; preserve source licences/attribution. No unlimited/free enterprise entitlement assumed. [API rate limits](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api)
- **Slack:** scopes, marketplace/distribution status and per-method history limits matter; do not base an ingestion design on an unlimited free archive. Proposed in-app/manual capture avoids that dependency. [Platform limits](https://docs.slack.dev/apis/web-api/rate-limits/), [Free-workspace limits](https://slack.com/help/articles/115002422943-Usage-limits-for-free-workspaces)
- **GitLab/Discord/VS Code/Notion/Loom:** product/API availability, approval flows, content licences and quotas need a connector-specific review before choosing implementation. This pass does not assert exact free API entitlements. P11/P15/P07 remain deferred rather than assuming access.
- **Open tools:** Gitleaks and Excalidraw repositories identify MIT licences. AppFlowy and Plane Community identify AGPL licences; inspiration is not permission to copy their code into DevSync without compatibility review. Audit the exact pinned component, rules, fonts/models and redistribution terms before adoption. [Gitleaks](https://github.com/gitleaks/gitleaks), [Excalidraw](https://github.com/excalidraw/excalidraw), [AppFlowy](https://github.com/AppFlowy-IO/AppFlowy), [Plane editions](https://developers.plane.so/self-hosting/editions-and-versions)
- **Generative services:** no selected first slice needs a paid LLM. Any later service needs configured keys, real per-actor/workspace allowance accounting, cancellation settlement, no-training/retention review and consent; confidential user content is not a free evaluation/training corpus. Local models also need hardware and model-licence review. Existing pgvector is storage/retrieval, not a free inference engine.
- **Hosting:** PostgreSQL/Redis, backups, delivery, abuse controls, exports and support have real costs. Self-hosting changes who pays/operates them; it does not eliminate costs or source/provider authority checks. No cost forecasts or savings figures were fabricated.

## Research follow-up and stop boundary

The required landscape,32 candidates, complete subjective ranking, eight selections and rejected variants are documented. The higher-value half of the research is evidence-backed prioritization and safety/reuse fit; exhaustive competitive trials, every connector's exact free-tier/licence review, user interviews, validated demand and detailed delivery estimates remain deferred. Height primary confirmation remains unavailable; segment-specific code-review/onboarding economics and low-bandwidth/language preferences remain unvalidated. No conversion, productivity, latency or revenue metrics were invented.

Proposed next research only: recruit consenting people across the five segments, including varied Indian connections and self-selected languages; ask about one recent real incident without collecting secrets. Check whether manual workflow prototypes would be used before automation. A response is not representative market evidence. Keep notes private/consented and publish only approved aggregates. Revisit ranking after that evidence. **Do not start building from this document.**
