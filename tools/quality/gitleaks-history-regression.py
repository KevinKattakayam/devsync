"""Verify immutable historical exceptions do not hide new generated credentials."""

import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='devsync-history-regression-') as directory:
    fixture = Path(directory)
    for path in ('docs/PROGRESS.md', 'tools/quality/load.js'):
        target = fixture / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text("webhookSecret: '" + secrets.token_hex(32) + "'\n")
    for args in (
        ['git', 'init', '-q'],
        ['git', 'config', 'user.name', 'Fixture'],
        ['git', 'config', 'user.email', 'fixture@example.invalid'],
        ['git', 'add', '.'],
        ['git', 'commit', '-q', '-m', 'synthetic detection regression'],
    ):
        subprocess.run(args, cwd=fixture, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    result = subprocess.run([
        'docker', 'run', '--rm', '--user', f'{os.getuid()}:{os.getgid()}',
        '-v', f'{fixture}:/repo:ro', '-v', f'{root / ".gitleaks.toml"}:/config.toml:ro',
        '-v', f'{root / ".gitleaksignore"}:/ignore:ro',
        'zricethezav/gitleaks@sha256:691af3c7c5a48b16f187ce3446d5f194838f91238f27270ed36eef6359a574d9',
        'git', '/repo', '--config=/config.toml',
        '--gitleaks-ignore-path=/ignore', '--redact=100', '--no-banner', '--log-level=error',
        '--report-format=json', '--report-path=/dev/stdout',
    ], capture_output=True, check=False)
    if result.returncode != 1:
        raise SystemExit('Synthetic history detection failed; raw scanner output withheld')
    try:
        findings = json.loads(result.stdout)
    except (TypeError, ValueError):
        raise SystemExit('Synthetic history scanner report invalid; raw output withheld') from None
    found = {item.get('File') for item in findings}
    if not {'docs/PROGRESS.md', 'tools/quality/load.js'}.issubset(found):
        raise SystemExit('Synthetic history paths not both detected; raw output withheld')
    print('Synthetic new credentials detected in both historical paths.')
