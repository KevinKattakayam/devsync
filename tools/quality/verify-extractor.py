"""Exercise local extractor artifacts with synthetic fixtures and no provider credentials.
Only this script's random container is removed. No host private environment is copied.
"""
from pathlib import Path
import json
import subprocess
import uuid

root = Path(__file__).resolve().parents[2]
output = root / 'docs/quality/release-correctness'
output.mkdir(parents=True, exist_ok=True)
name = 'devsync-extractor-check-' + uuid.uuid4().hex[:12]
records = []

def run(args):
    result = subprocess.run(args, cwd=root, capture_output=True, text=True, check=False)
    records.append({'command': args, 'exit': result.returncode})
    if result.returncode:
        raise RuntimeError('Verification command failed; exit ' + str(result.returncode))
    return result.stdout.strip()

probe = r"""
const fs = require('fs');
(async()=>{
 const cases = [['synthetic.pdf','application/pdf',200,'SYNTHETIC PDF TEST'],
 ['synthetic-text.png','image/png',200,'SYNTHETIC TEST'],
 ['over-page-limit.pdf','application/pdf',422,'']];
 const results=[];
 for(const [file,mime,status,text] of cases){
  const response=await fetch('http://127.0.0.1:5001/extract',{method:'POST',headers:{'Content-Type':mime},body:fs.readFileSync('/fixtures/'+file),signal:AbortSignal.timeout(35000)});
  const body=await response.text();
  if(response.status!==status || (text && !JSON.parse(body).text.includes(text))) throw Error('Synthetic case failed: '+file);
  results.push({fixture:file,status:response.status,syntheticTextVerified:!!text});
 }
 console.log(JSON.stringify({uid:process.getuid(),applicationCredentialsPresent:['DATABASE_URL','REDIS_URL','CLERK_SECRET_KEY','OPENAI_API_KEY','GROQ_API_KEY'].some(k=>!!process.env[k]),results}));
})().catch(()=>process.exitCode=1);
"""
report = {'status': 'failed', 'commands': records}
try:
    image_id = run(['docker', 'image', 'inspect', '--format', '{{.Id}}', 'devsync-extractor:release-correctness'])
    run(['docker', 'run', '--detach', '--name', name, '--network', 'none', '--read-only',
         '--cap-drop', 'ALL', '--security-opt', 'no-new-privileges:true', '--memory', '512m',
         '--cpus', '1', '--pids-limit', '64', '--tmpfs', '/tmp:rw,noexec,nosuid,size=64m',
         '--init', '-v', str(root/'backend/src/__tests__/fixtures/extraction')+':/fixtures:ro',
         'devsync-extractor:release-correctness'])
    ready = "(async()=>{for(let n=0;n<100;n++){try{if((await fetch('http://127.0.0.1:5001/healthz')).ok)return;}catch{} await new Promise(r=>setTimeout(r,100));}process.exitCode=1;})()"
    run(['docker', 'exec', name, 'node', '-e', ready])
    checks = json.loads(run(['docker', 'exec', name, 'node', '-e', probe]))
    assert checks['uid'] != 0 and not checks['applicationCredentialsPresent']
    constraints = run(['docker','inspect','--format', '{{.HostConfig.NetworkMode}} {{.HostConfig.ReadonlyRootfs}} {{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}}', name])
    assert constraints == 'none true 536870912 1000000000 64'
    report.update(status='passed', imageId=image_id, checks=checks, isolation=constraints)
except Exception as error:
    report['error'] = str(error)
finally:
    cleanup = subprocess.run(['docker','rm','--force',name], capture_output=True, text=True, check=False)
    records.append({'command':['docker','rm','--force',name], 'exit':cleanup.returncode})
    (output/'extractor-runtime.json').write_text(json.dumps(report, indent=2)+'\n')
print(json.dumps(report, indent=2))
if report['status'] != 'passed':
    raise SystemExit(1)
