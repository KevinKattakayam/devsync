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
