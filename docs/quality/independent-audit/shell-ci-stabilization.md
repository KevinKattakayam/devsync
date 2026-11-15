# Shell CI stabilization — local acceptance

The user reports the final Ubuntu shell suite passed **8/8** using Playwright's bundled Chromium 151.0.7922.34. This is host-executed fixture-browser evidence, not hosted provider acceptance. GitHub CI verification of this checkpoint remains pending; nothing was pushed or deployed.

The final changes pin the shell browser version, collect passive renderer metadata with guarded fields, hide route descendants during screenshots, preserve Radix portal layers, and wait for menus using their trigger-derived accessible names. The capture regression retains route-height independence and adds explicitly visible inline floats and nested portal coverage. Two unit regressions cover unavailable and partial diagnostic reads.

Thirty-one individually reviewed snapshots align the current navigation and overlay states with Chromium 151. Four mobile captures were corrected again after confirming their former expected images contained leaked route controls. Nine unaffected snapshots remain unchanged. Earlier failed runs and downloaded CI artifacts were preserved.

Review confirms `maxDiffPixelRatio: 0.002`, axe violation assertions, keyboard/focus checks, viewport checks and read-only authority coverage remain intact. No application runtime or security policy changed.

Local follow-up checks: backend lint, testing TypeScript, targeted Prettier, diagnostic tests (2/2), backend build and diff checks. The focused unit command uses `--coverage=false`; repository coverage thresholds are unchanged and a new full coverage pass is not claimed.
