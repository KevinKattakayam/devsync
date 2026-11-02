"""Verify one-command local startup from a clean, credential-free clone; remove only its own stack."""
from pathlib import Path
import json
import os
import subprocess
import tempfile
import time
import urllib.request
import urllib.error
import uuid

root = Path(__file__).resolve().parents[2]
output = root / 'docs/deployment/evidence/clean-clone'
output.mkdir(parents=True, exist_ok=True)
clone = Path(tempfile.mkdtemp(prefix='devsync-phase5b-')) / 'checkout'
project = 'devsync_phase5b_' + uuid.uuid4().hex[:10]
env = dict(os.environ)
for key in list(env):
    if key.startswith(('CLERK_', 'NEXT_PUBLIC_', 'SEED_', 'GROQ_', 'OPENAI_')):
        env.pop(key)
env.update(FRONTEND_PORT='3405', BACKEND_PORT='5405')
report = {'project':project, 'clone':str(clone), 'checks':{}, 'status':'failed'}

def run(args, name, check=True):
    with (output / name).open('w') as log:
        result = subprocess.run(args, cwd=clone if clone.exists() else root, env=env,
                                stdout=log, stderr=subprocess.STDOUT, check=False)
    if check and result.returncode:
        raise RuntimeError(f'{name} failed with exit {result.returncode}')
    return (output / name).read_text()

compose = ['docker', 'compose', '--project-name', project]
try:
    run(['git','clone','--no-hardlinks','--quiet',str(root),str(clone)], 'clone.txt')
    report['commit']=run(['git','rev-parse','HEAD'],'commit.txt').strip()
    report['checks']['cleanGitStatus']=not run(['git','status','--porcelain'],'status.txt').strip()
    report['checks']['noCopiedDependencies']=not (clone/'frontend/node_modules').exists() and not (clone/'backend/node_modules').exists()
    report['checks']['noPrivateEnvironmentFiles']=not any(p.exists() for p in [clone/'.env',clone/'backend/.env',clone/'frontend/.env.local'])
    if not all(report['checks'].values()): raise RuntimeError('Clone isolation failed')
    started=time.monotonic()
    run(compose+['up','--build','--detach','--wait','--wait-timeout','180'],'compose-up.txt')
    report['startupSeconds']=round(time.monotonic()-started,3)
    report['checks']['backendUid']=int(run(compose+['exec','-T','backend','id','-u'],'backend-uid.txt').strip())
    report['checks']['workerUid']=int(run(compose+['exec','-T','worker','id','-u'],'worker-uid.txt').strip())
    assert report['checks']['workerUid'] != 0
    report['checks']['frontendUid']=int(run(compose+['exec','-T','frontend','id','-u'],'frontend-uid.txt').strip())
    assert report['checks']['backendUid'] != 0 and report['checks']['frontendUid'] != 0
    def get(url):
        try:
            with urllib.request.urlopen(url,timeout=10) as response: return response.status,response.read().decode()
        except urllib.error.HTTPError as response: return response.code,response.read().decode()
    report['checks']['frontendHealth']=get('http://127.0.0.1:3405/healthz')[0]
    page=get('http://127.0.0.1:3405/')
    report['checks']['setupGuidance']=page[0] == 200 and 'DevSync local setup' in page[1]
    report['checks']['backendHealth']=get('http://127.0.0.1:5405/api/health')[0]
    report['checks']['protectedIdentity']=get('http://127.0.0.1:5405/api/auth/me')[0]
    report['checks']['readinessWithoutClerk']=get('http://127.0.0.1:5405/api/ready')[0]
    assert report['checks']['frontendHealth']==200 and report['checks']['backendHealth']==200
    assert report['checks']['setupGuidance'] and report['checks']['protectedIdentity']==401
    assert report['checks']['readinessWithoutClerk']==503
    sql='SELECT count(*) FROM "Workspace" WHERE id=\'devsync-sample\''
    report['checks']['sampleWorkspaces']=int(run(compose+['exec','-T','postgres','psql','-U','devsync_admin','-d','devsync','-tA','-c',sql],'seed-count.txt').strip())
    assert report['checks']['sampleWorkspaces']==1
    code="""const fs=require('fs'); const {PrismaClient}=require('@prisma/client');
const pw=fs.readFileSync('/state/runtime/database-password','utf8').trim();
const db=new PrismaClient({datasources:{db:{url:'postgresql://devsync_runtime:'+pw+'@postgres:5432/devsync'}}});
(async()=>{try{const [r]=await db.$queryRaw`SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user`;
console.log(JSON.stringify({...r,adminCredentialsMounted:fs.existsSync('/state/admin/postgres-password')}));}finally{await db.$disconnect();}})().catch(()=>process.exitCode=1);"""
    role=json.loads(run(compose+['exec','-T','backend','node','-e',code],'runtime-role.json'))
    report['checks']['runtimeRole']=role
    assert role=={'rolsuper':False,'rolbypassrls':False,'adminCredentialsMounted':False}
    run(compose+['ps','--all','--format','json'],'services.json')
    report['status']='passed'
except Exception as error:
    report['error']=str(error)
finally:
    if clone.exists():
        run(compose+['logs','--no-color'],'compose-logs.txt',check=False)
        run(compose+['down','--volumes','--remove-orphans'],'cleanup.txt',check=False)
    (output/'result.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
if report['status']!='passed': raise SystemExit(1)
