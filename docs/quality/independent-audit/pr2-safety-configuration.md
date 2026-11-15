# PR #2 authorized pre-merge safety configuration

Applied on 2026-11-15 with explicit user authorization. No merge, application push, deployment workflow dispatch, deployment, resource creation/deletion, plan upgrade, database access or production-data mutation was performed.

| Target                               | Before                                                          | Verified after                                                                                       |
| ------------------------------------ | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Railway production backend           | Git source `Kevinbastin/devsync`; latest deployment branch main | Git and image source both null                                                                       |
| Railway production frontend          | Git source `Kevinbastin/devsync`; latest deployment branch main | Git and image source both null                                                                       |
| Vercel project devsync               | GitHub repository linked; production branch main                | Git link null                                                                                        |
| GitHub Protect main ruleset 27260564 | Active, PR mandatory, zero approvals, required-check list empty | Active, PR mandatory, zero approvals, 27 required contexts bound to GitHub Actions integration 15368 |

Used supported `railway service source disconnect` for only the two named services and `vercel git disconnect` for the existing DevSync project. This removes automatic Git triggers; manual deployment remains possible only as a future explicit action. The Vercel API `createDeployments` option describes GitHub deployment records and was deliberately not treated as proof that hosting builds were disabled. Disconnecting the Git link provides a verifiable boundary instead.

Read-only post-change assertions confirmed unchanged Railway project/service identities, Postgres source, start commands, replica settings, cron settings, domains and latest deployment IDs. Vercel project identity, framework, root/build/install settings, Node version, environment metadata, deployment targets and latest deployment list matched the before snapshot. No new deployment was observed. No billing configuration changed or new paid service was enabled; existing unrelated resource charges are not assessed or eliminated by these safety changes.

The GitHub ruleset update changed only the required-check contexts. Deletion/force-push restrictions, mandatory PR parameters, zero reviewers, no bypass actors and existing non-strict up-to-date policy were preserved. All 27 successful Quality contexts were added, including all three container checks and every E2E matrix target. Names were taken from actual successful check runs, not inferred job labels.

Main-push Quality still runs and may publish reviewed API/extractor SHA-tagged images to GHCR with provenance after gates. The CI-only frontend is excluded. Railway API/frontend now have neither Git nor image source, and the only preserved Postgres image source is unrelated to DevSync GHCR images. Vercel has no Git link. Production/preview deployment workflows remain manual dispatch; no automatic hosted image consumer was found in the inspected provider configuration. Artifact publication is not production deployment. Future trigger/source reconnection or manual workflow dispatch requires a separate explicit decision.

Final readiness applies only to PR head `317c06e787812bd791e882f8df29b4587b13e798` and main `4406567c386c6f40fbb27bb495786003e058fbfe`, whose synthetic merge passed all 27 jobs in Quality run `43693930633`. This is merge safety evidence, not deployment readiness or completion of hosted acceptance requirements. Local unrelated changes and downloaded evidence were preserved.

## Required checks verified after update

- `compose`
- `containers (backend, backend, runner, devsync-api)`
- `containers (backend, extractor, extractor, devsync-extractor)`
- `containers (frontend, frontend-ci-scan-only, ci-runner, devsync-web-ci-scan-only)`
- `coverage (backend)`
- `coverage (frontend)`
- `e2e (ai-cost)`
- `e2e (async-digest)`
- `e2e (automation)`
- `e2e (core)`
- `e2e (dashboard)`
- `e2e (decision-execution)`
- `e2e (decisions)`
- `e2e (editor)`
- `e2e (github-trail)`
- `e2e (grounded)`
- `e2e (identity)`
- `e2e (kanban)`
- `e2e (recovery)`
- `e2e (search)`
- `e2e (settings)`
- `e2e (shell)`
- `e2e (snippet-safety)`
- `hosting-config`
- `quality (backend)`
- `quality (frontend)`
- `source-security`

Final REST verification reports the same head/base, mergeable true, clean merge state and all 27 required contexts successful. Verdict: **MERGE READY** for this reviewed pair of commits. No merge was performed.
