# Reporting security issues

Do not post credentials, private workspace content or exploit details in a public issue. If this repository offers **Security → Report a vulnerability**, use that private reporting channel. Otherwise contact a maintainer through an existing trusted private channel before sharing sensitive details. No dedicated security email address, response-time commitment or bug bounty is configured here.

Include the affected commit/version, prerequisites, a minimal reproduction using synthetic data, and expected versus observed behavior. Do not access another person's workspace, run destructive probes, or test infrastructure you do not own. Remove tokens and content from logs/screenshots before sharing them.

This branch is under development and has documented open risks. Consult docs/PROGRESS.md and docs/quality/README.md before deployment. Configure secrets privately, use a non-bypass database runtime role, keep provider spending caps, and review the shared Redis requirements. Test fixtures are not production authentication. No supported-version or remediation SLA is promised.

Repository licensing remains a maintainer decision; this security policy does not grant a software license.
