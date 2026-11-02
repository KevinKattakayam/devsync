"""Run required gates and retain their unedited output; never serialize environment variables."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[2]
service = sys.argv[1]
if service not in ('backend', 'frontend'):
    raise SystemExit('Choose backend or frontend')
output = root / (sys.argv[2] if len(sys.argv) > 2 else 'docs/quality')
output.resolve().relative_to(root)
output.mkdir(parents=True, exist_ok=True)
commands = [('lint', ['npm', 'run', 'lint']), ('format', ['npm', 'run', 'format:check']),
            ('types', ['npm', 'run', 'typecheck']), ('tests', ['npm', 'test']),
            ('build', ['npm', 'run', 'build'] + (['--', '--webpack'] if service == 'frontend' else []))]
env = dict(os.environ)
if service == 'frontend':
    env['QUALITY_COVERAGE'] = '1'
    env['QUALITY_COVERAGE_DIRECTORY'] = str(output / 'frontend-coverage')
results = []
for name, command in commands:
    path = output / f'{service}-{name}.txt'
    started = time.monotonic()
    with path.open('w') as log:
        result = subprocess.run(command, cwd=root / service, env=env, stdout=log, stderr=subprocess.STDOUT, check=False)
    results.append({'gate':name, 'command':command, 'exitCode':result.returncode,
                    'elapsedSeconds':round(time.monotonic()-started, 3), 'output':path.name})
    (output / f'{service}-gates.json').write_text(json.dumps(results, indent=2)+'\n')
    print(f'{service} {name}: exit {result.returncode}; raw output {path.relative_to(root)}', flush=True)
    if result.returncode:
        print('\n'.join(path.read_text().splitlines()[-35:]), flush=True)
        raise SystemExit(result.returncode)
