# Release correctness runtime follow-up — 2026-11-08

The current local API, extractor and keyless-local frontend images each have **zero reported findings across all severities** in the retained Trivy0.68.2 scans using the same fresh database. [Exact image IDs, unsuppressed reports and SBOMs](docs/quality/release-correctness/README.md) are retained in docs/quality/release-correctness. This is local amd64 evidence, not hosted CI, an all-architecture assessment or production approval.

The prior four runtime glob/minimatch rows below are closed by Sentry11.11.0 (glob14.0.4/minimatch11.0.5) and a scoped same-major gaxios7.3.1 selection under gcp-metadata8.1.4, removing its rimraf/glob chain. No broad major-version glob override was used. Normal lockfile installs, strict types, actual DB/Redis/protocol tests, telemetry and builds were exercised. Actual GCP metadata/provider behavior remains unverified.

The first fresh scan also found a new Medium zlib CVE-2026-4738 at1.3.2-r1. Both application bases now explicitly install fixed zlib1.4-r0 from the same stable Alpine3.24 main repository. No unstable distribution or blanket OS upgrade was used. The intermediate finding, stable package policy, final scans and native PDF/OCR checks remain in the phase evidence. Existing pinned Node image digest and musl/platform support tradeoffs remain unchanged.

Current npm audits report backend production0 advisories; full backend29 Moderate/2 Low and frontend8 Moderate. These development/full-tree findings remain visible; the High/Critical gates and coverage policies were not relaxed. Build/tooling artifacts are not represented as having clean runtime scans. Recheck all findings against the actual promoted image and current advisory database before release.

The historical snapshot below is retained as before evidence; its four remaining findings and "current" terminology are superseded by this follow-up.

---

# Current runtime vulnerability inventory

Local runtime follow-up on upgrade/enterprise. Both runtime Dockerfiles now pin the official Node22 Alpine variant to sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914. No unstable Debian packages or scanner suppressions were introduced. This is a local amd64 verification, not hosted CI or a production assessment.

## Actual comparison

Trivy0.68.2, same downloaded vulnerability database for retained Debian runtime and rebuilt Alpine scans. Full unsuppressed JSON and stdout: [raw evidence](docs/quality/runtime-followup/), [machine-readable comparison](docs/quality/runtime-followup/scan-comparison.json).

| Runtime  | Before C/H/M/L/U | After C/H/M/L/U |
| -------- | ---------------- | --------------- |
| Backend  | 0/44/75/60/8     | 0/0/4/0/0       |
| Frontend | 0/44/71/60/8     | 0/0/0/0/0       |

The latest Node22 Trixie tag resolves to the previously pinned digest; merely pulling it offers no package change. The alternative Alpine base scan includes10 High npm/tooling findings, but both runtime stages retain the existing removal of npm/npx/Yarn. The rebuilt runtime reports above include application dependencies. Migration/build tooling is separate and is not represented as having a clean scan.

The prior Debian High packages are absent from the selected Alpine runtime; they were not hidden or patched by deleting scanner metadata. Original per-package/CVE inventory and bounded historical acceptance reasons remain in [Phase5a-3](docs/quality/phase5a-3/VULNERABILITIES.md). The current remaining findings all list fixed versions; no current unpatched High/Critical exception list is needed. The CI gate is unchanged. Scan counts are package/advisory entries, not exploit counts.

## Every remaining finding

| Target    | Package   | CVE             | Severity | Installed | Fixed  | Assessment                                                                                                  |
| --------- | --------- | --------------- | -------- | --------- | ------ | ----------------------------------------------------------------------------------------------------------- |
| `Node.js` | glob      | CVE-2026-118773 | MEDIUM   | 10.5.0    | 14.0.2 | Reachability not verified; compatibility review required before major dependency replacement. No exception. |
| `Node.js` | glob      | CVE-2026-118773 | MEDIUM   | 13.0.6    | 14.0.2 | Reachability not verified; compatibility review required before major dependency replacement. No exception. |
| `Node.js` | minimatch | CVE-2026-118764 | MEDIUM   | 10.2.6    | 11.0.1 | Reachability not verified; compatibility review required before major dependency replacement. No exception. |
| `Node.js` | minimatch | CVE-2026-118764 | MEDIUM   | 9.0.9     | 11.0.1 | Reachability not verified; compatibility review required before major dependency replacement. No exception. |

No non-exploitability claim is made for these Medium dependency findings. Major-version fixes are not applied without compatibility work; review is deferred and findings remain unsuppressed. No permanent risk waiver or CI exception is created. Review date:2026-11-02; next review before production release or when dependency compatibility is established.

## Compatibility and limits

[Official Node image guidance](https://github.com/nodejs/docker-node) documents Alpine's musl differences and experimental Node platform support tier. This is an official maintained Docker variant, not equivalent to Debian's Node platform support tier. The smaller OS footprint removes the Debian findings at that compatibility tradeoff. Both builds, local app gates and isolated Compose migrations/seeds/startup were exercised; only this machine/architecture is verified. Alpine package installation uses stable repositories, not a fully snapshotted package resolution.

Both runtime services retain non-root identity; Compose drops capabilities and prevents privilege gain. BusyBox retains multi-call applets, so absence of a particular Debian tool path is not a claim that every native applet is removed. Host controls still require verification. The runtime is not approved for production solely because the local High/Critical count is zero.
