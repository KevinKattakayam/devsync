"""Run each service's checks sequentially; never replace dependencies during tests."""
import concurrent.futures,json,pathlib,subprocess,sys,os,signal
root=pathlib.Path(__file__).resolve().parents[2]
group=sys.argv[1]
steps=[('install',['npm','ci','--no-audit']),('lint',['npm','run','lint']),('format',['npm','run','format:check']),('typecheck',['npm','run','typecheck']),('tests',['npm','test']),('build',['npm','run','build'])]
def service(name):
 results=[]
 for step,cmd in steps:
  target=root/'docs/phase1b-evidence'/f'{group}-{name}-{step}.log'
  with target.open('wb') as log:
   try:
    run=subprocess.Popen(cmd,cwd=root/name,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
    code=run.wait(timeout=240)
   except subprocess.TimeoutExpired:
    os.killpg(run.pid,signal.SIGTERM)
    try:run.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(run.pid,signal.SIGKILL);run.wait()
    code='timeout240'
  results.append({'step':step,'command':cmd,'exit':code})
  print(f'{name} {step}: {code}',flush=True)
  if step in ['lint','format','typecheck','tests','build']:
   print(target.read_text(errors='replace')[-900:],flush=True)
  if code!=0:break
 return name,results
names=sys.argv[2:] or ['backend','frontend']
assert all(name in ['backend','frontend'] for name in names)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool: result=dict(pool.map(service,names))
(root/'docs/phase1b-evidence'/f'{group}-results.json').write_text(json.dumps(result,indent=2))
if any(len(rows)!=len(steps) or any(r['exit']!=0 for r in rows) for rows in result.values()):sys.exit(1)
