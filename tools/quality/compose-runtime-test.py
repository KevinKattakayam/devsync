"""Test rebuilt runtime images in an isolated Compose project; never copy private envs."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

root = Path(__file__).resolve().parents[2]
output = root / 'docs/quality/phase5a-3/compose'
output.mkdir(parents=True, exist_ok=True)
project = 'devsync_phase5a3_' + uuid.uuid4().hex[:10]
env = dict(os.environ)
env.update(FRONTEND_PORT='3406', BACKEND_PORT='5406', CLERK_SECRET_KEY='',
           NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY='', SEED_OWNER_CLERK_ID='user_local_owner',
           SEED_EDITOR_CLERK_ID='user_local_editor', SEED_VIEWER_CLERK_ID='user_local_viewer')
report = {'project': project, 'status': 'failed', 'checks': {}}

def run(args, name, check=True):
    with (output / name).open('w') as log:
        result = subprocess.run(args, cwd=root, env=env, stdout=log, stderr=subprocess.STDOUT, check=False)
    if check and result.returncode:
        raise RuntimeError(f'{name}: exit {result.returncode}')
    return (output / name).read_text()

def status(url):
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            return response.status, response.read().decode()
    except urllib.error.HTTPError as response:
        return response.code, ''

# Fixed package/OS metadata only: no env, file contents, tokens or credentials are emitted.
probe = r'''const fs=require('node:fs'); const {spawnSync}=require('node:child_process');
const cap=fs.readFileSync('/proc/self/status','utf8').match(/^CapEff:\s*([0-9a-f]+)/m)?.[1];
const nnp=fs.readFileSync('/proc/self/status','utf8').match(/^NoNewPrivs:\s*([01])/m)?.[1];
const fstab=fs.readFileSync('/etc/fstab','utf8').split('\n').filter(x=>x.trim()&&!x.trim().startsWith('#'));
const archive=spawnSync('perl',['-MArchive::Tar','-e','exit 0'],{stdio:'ignore'});
const packages=spawnSync('dpkg-query',['-W','-f=${Package}\t${Version}\n','zlib1g','bsdutils','util-linux','libacl1','libsystemd0','libudev1','libtinfo6','ncurses-base','ncurses-bin','perl-base','gzip'],{encoding:'utf8'});
console.log(JSON.stringify({uid:process.getuid(),capSysAdmin:cap?Boolean(BigInt('0x'+cap)&(1n<<21n)):null,
noNewPrivileges:nnp==='1',mountToolsPresent:['/usr/bin/mount','/usr/bin/umount','/usr/bin/nsenter'].some(p=>fs.existsSync(p)),fstabEntries:fstab.length,systemdHomedPresent:['/usr/lib/systemd/systemd-homed','/lib/systemd/systemd-homed','/usr/bin/homectl'].some(p=>fs.existsSync(p)),
archiveTarModulePresent:archive.status===0,infocmpPresent:fs.existsSync('/usr/bin/infocmp'),packages:packages.stdout?.trim().split('\n')}));'''

with tempfile.TemporaryDirectory(prefix='devsync-compose-5a3-') as directory:
    override = Path(directory) / 'images.json'
    images = {'bootstrap': 'devsync-tooling:phase5a-3', 'initialize': 'devsync-tooling:phase5a-3',
              'backend': 'devsync-backend:phase5a-3', 'worker': 'devsync-backend:phase5a-3',
              'frontend': 'devsync-frontend:phase5a-3'}
    override.write_text(json.dumps({'services': {key: {'image': value} for key, value in images.items()}}))
    compose = ['docker', 'compose', '--project-directory', str(root), '-f', str(root / 'docker-compose.yml'), '-f', str(override), '--project-name', project]
    try:
        started = time.monotonic()
        run(compose + ['up', '--no-build', '--detach', '--wait', '--wait-timeout', '180'], 'startup.txt')
        report['startupSeconds'] = round(time.monotonic() - started, 3)
        checks = report['checks']
        for service in ['backend', 'frontend']:
            checks[service] = json.loads(run(compose + ['exec', '-T', service, 'node', '-e', probe], service + '-runtime.json'))
            assert checks[service]['uid'] == 1000
            assert checks[service]['capSysAdmin'] is False
            assert checks[service]['noNewPrivileges'] is True
            assert checks[service]['mountToolsPresent'] is False
            assert checks[service]['infocmpPresent'] is False
        checks['workerUid'] = int(run(compose + ['exec', '-T', 'worker', 'id', '-u'], 'worker-uid.txt').strip())
        assert checks['workerUid'] == 1000
        checks['frontendHealth'] = status('http://127.0.0.1:3406/healthz')[0]
        code, body = status('http://127.0.0.1:3406/')
        checks['setupGuidance'] = code == 200 and 'DevSync local setup' in body
        checks['backendHealth'] = status('http://127.0.0.1:5406/api/health')[0]
        checks['privateIdentity'] = status('http://127.0.0.1:5406/api/auth/me')[0]
        checks['unconfiguredReadiness'] = status('http://127.0.0.1:5406/api/ready')[0]
        assert checks['frontendHealth'] == checks['backendHealth'] == 200
        assert checks['setupGuidance'] and checks['privateIdentity'] == 401
        assert checks['unconfiguredReadiness'] == 503
        query = 'SELECT count(*) FROM "Workspace" WHERE id=\'devsync-sample\''
        checks['sampleWorkspaces'] = int(run(compose + ['exec', '-T', 'postgres', 'psql', '-U', 'devsync_admin', '-d', 'devsync', '-tA', '-c', query], 'seed-count.txt').strip())
        assert checks['sampleWorkspaces'] == 1
        run(compose + ['ps', '--all', '--format', 'json'], 'services.json')
        report['status'] = 'passed'
    except Exception as error:
        report['error'] = str(error)
    finally:
        run(compose + ['logs', '--no-color'], 'logs.txt', check=False)
        run(compose + ['down', '--volumes', '--remove-orphans'], 'cleanup.txt', check=False)
        (output / 'result.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
if report['status'] != 'passed':
    raise SystemExit(1)
