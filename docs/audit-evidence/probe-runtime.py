import subprocess,json,pathlib
base=pathlib.Path('docs/audit-evidence');results=[]
for name,cmd in [('health',['curl','--max-time','15','-i','http://localhost:5000/api/health']),('ready',['curl','--max-time','15','-i','http://localhost:5000/api/ready']),('docker',['docker','info','--format','{{.ServerVersion}}']),('compose',['docker','compose','config','--quiet']),('terraform',['terraform','version'])]:
 try:
  r=subprocess.run(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=25);(base/(name+'-probe.log')).write_bytes(r.stdout);results.append({'name':name,'command':cmd,'exit':r.returncode})
 except Exception as e:(base/(name+'-probe.log')).write_text(str(e));results.append({'name':name,'command':cmd,'error':str(e)})
(base/'runtime-probes.json').write_text(json.dumps(results,indent=2))
