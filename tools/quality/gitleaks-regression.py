"""Exercise narrow scanner exceptions with generated, non-provider test strings.

No raw scanner capture or synthetic value is printed/persisted in evidence.
Run from repository root with Docker available. Temporary fixtures are discarded.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
with tempfile.TemporaryDirectory(prefix='devsync-scanner-regression-') as directory:
    fixtures = Path(directory)
    test_path = 'backend/src/__tests__/resource-mutations.integration.test.ts'
    cases = {
        'empty-example': ('backend/.env.example', 'CLERK_SECRET_KEY=""\nCLERK_PUBLISHABLE_KEY=""\n', False),
        'known-fixture': (test_path, "webhookSecret: 'fixture-secret-123'", False),
        'new-value-in-example': ('backend/.env.example', 'CLERK_SECRET_KEY="' + secrets.token_hex(32) + '"', True),
        'new-value-in-test': (test_path, "webhookSecret: '" + secrets.token_hex(32) + "'", True),
        'known-value-elsewhere': ('backend/src/other.ts', "webhookSecret: 'fixture-secret-123'", True),
    }
    for name, (path, content, _) in cases.items():
        target = fixtures / name / path
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
    result = subprocess.run([
        'docker', 'run', '--rm', '--user', f'{os.getuid()}:{os.getgid()}',
        '-v', f'{fixtures}:/fixtures:ro', '-v', f'{root / ".gitleaks.toml"}:/config.toml:ro',
        'zricethezav/gitleaks:v8.30.0', 'dir', '/fixtures', '--config=/config.toml',
        '--redact=100', '--no-banner', '--log-level=error',
        '--report-format=json', '--report-path=/dev/stdout',
    ], capture_output=True, check=False)
    if result.returncode != 1:
        raise SystemExit('Scanner regression failed: expected findings exit; raw output withheld')
    try:
        findings = json.loads(result.stdout)
    except (ValueError, TypeError):
        raise SystemExit("Scanner regression returned invalid JSON; raw output withheld") from None
    rows = []
    for name, (_, _, expected) in cases.items():
        detected = any(f'/fixtures/{name}/' in item['File'] for item in findings)
        rows.append({'case': name, 'expectedDetection': expected, 'detected': detected})
    report = {'passed': all(row['expectedDetection'] == row['detected'] for row in rows), 'cases': rows}
    (root / 'docs/quality/phase5a-2/gitleaks-regression.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    if not report['passed']:
        raise SystemExit(1)
