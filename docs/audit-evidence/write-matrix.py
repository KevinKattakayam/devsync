from pathlib import Path
import re
rows=[]
def row(route,auth,permission,validation,source):rows.append((route,auth,permission,validation,source))
def line(file,needle):return str(next(i for i,s in enumerate(Path(file).read_text().splitlines(),1) if needle in s))
base='backend/src/routes/'
for p in sorted(Path(base).glob('*.ts')):
 prefix={'auth.routes.ts':'/api/auth','workspace.routes.ts':'/api/workspaces','document.routes.ts':'/api/documents','task.routes.ts':'/api/tasks','snippet.routes.ts':'/api/snippets','ai.routes.ts':'/api/ai','github-webhook.routes.ts':'/api/webhooks/github','stripe.webhook.ts':'/api/webhooks/stripe','superadmin.routes.ts':'/api/superadmin','scim.routes.ts':'/scim/v2','ingestion.routes.ts':'/api'}[p.name]
 for m in re.finditer(r"router\.(get|post|patch|delete)\(\s*['\"]([^'\"]+)['\"]([^;]*?)(?:;|\Z)",p.read_text(),re.S):
  method,path,body=m.groups(); route=method.upper()+' '+prefix+('' if path=='/' else path); n=p.read_text()[:m.start()].count('\n')+1
  auth='Clerk + local principal'; val='Zod body' if 'validate(' in body else 'No body schema / ID format validation'
  perm=''
  if p.name=='workspace.routes.ts':
   perm='OWNER' if 'requireOwner()' in body else 'OWNER / EDITOR' if 'requireEditor()' in body else 'Any workspace member' if 'requireWorkspaceMember()' in body else 'Own membership filter' if method=='get' else 'Authenticated creator becomes OWNER'
   if 'members/:memberId' in path:perm+=' of URL workspace; target memberId NOT bound (D05)'
   if 'search' in path:val='Zod query (q,limit)'
   if 'github-repositories/:repositoryId' in path:perm+='; target repository checked against workspace'
   if path.endswith('/documents') and method=='post':perm+='; parentId NOT bound (D08)'
  elif p.name=='auth.routes.ts':
   perm='Self'; auth='Clerk getAuth or verified bearer fallback' if path=='/sync' else auth
   if method=='patch':perm+='; unsafe original body permits privilege escalation (D01)'
  elif p.name=='document.routes.ts':perm='Document -> membership; write excludes VIEWER';val='Zod body with content:any' if method=='patch' else val
  elif p.name=='snippet.routes.ts':perm='NONE (all signed-in users); host execution (E01)' if path=='/execute' else 'Snippet -> workspace membership; excludes VIEWER'
  elif p.name=='task.routes.ts':
   perm='NONE: arbitrary board ID (D06)' if method=='post' and '/boards/' in path else 'Column/task -> workspace membership; excludes VIEWER'
   if path.endswith('/move') or method=='patch' and path.startswith('/tasks/'):perm+='; destination same-workspace check'
   if '/tasks' in path and method in ['post','patch']:perm+='; assigneeId not membership-bound'
  elif p.name=='ai.routes.ts':perm='Workspace membership (VIEWER allowed); balance preflight BEFORE membership';val='Truthiness checks only; IP AI limiter'
  elif p.name=='github-webhook.routes.ts':auth='Repository-specific HMAC signature';perm='Target column bound; task-key lookup NOT tenant-bound (G08)';val='Envelope Zod, action fields largely any; delivery ID dedup'
  elif p.name=='stripe.webhook.ts':auth='Stripe signature on raw body';perm='Workspace selected from signed metadata/customer/subscription';val='Stripe verified event; no replay/order ledger'
  elif p.name=='superadmin.routes.ts':auth='Service token OR Clerk + DB SUPER_ADMIN';perm='Global administrative authority';val='Zod reason' if method=='post' else 'N/A'
  elif p.name=='scim.routes.ts':auth='SHA-256 bearer token lookup + timingSafeEqual';perm='Token workspace; external identity composite bound; global User edited (C04)';val='Zod custom User or partial; not standard SCIM Operations envelope' if method!='delete' else 'External ID lookup'
  else:perm='Workspace member excluding VIEWER, after buffering';val='Multer 25MB, MIME allowlist; no filename/page/image limits'
  row(route,auth,perm,val,f'{p}:{n}')
for name in ['health','ready']:row('GET /api/'+name,'Public','None (operational endpoint)','N/A','backend/src/app.ts:'+line('backend/src/app.ts',"app.get('/api/"+name))
row('GET /api/auth/reset (Next)','Public','No user/workspace check; arbitrary redirect and cookie clearing','No redirect allowlist','frontend/src/app/api/auth/reset/route.ts:4')
row('POST /api/superadmin/workspaces/:workspaceId/kill-switch (Next)','Clerk currentUser','publicMetadata.systemRole=SUPER_ADMIN; forwards service token','Zod reason; encoded workspace ID','frontend/src/app/api/superadmin/workspaces/[workspaceId]/kill-switch/route.ts:7')
s='# Authorization matrix\n\nStatic route-by-route review of every registered REST route and every Socket.io input event. This is not a passing integration-test report. OWNER/EDITOR/VIEWER are database workspace roles; there is no per-document ownership ACL beyond membership. Authz checks do not overcome RLS context failures (G01). Every REST route passes Helmet, configured CORS, parsing, trace and global IP limiter; global limiting is skipped outside production.\n\n## REST and Next route handlers\n\n| Route | Authentication | Permission checks actually present | Validation | Evidence |\n|---|---|---|---|---|\n'
s+=''.join('| '+' | '.join('`'+x+'`' if i in [0,4] else x.replace('|','/') for i,x in enumerate(r))+' |\n' for r in rows)
s+='\n## Socket.io input events\n\nAll connections require a Clerk token and local user lookup; isActive is not checked. Event rate buckets are per socket/event type, not per tenant/user. Only the following client events are registered.\n\n| Event | Membership | Role/resource binding | Validation | Evidence |\n|---|---|---|---|---|\n'
for file in ['presence.handler.ts','kanban.handler.ts','index.ts']:
 p=Path('backend/src/socket')/file
 for i,l in enumerate(p.read_text().splitlines(),1):
  m=re.search(r"socket.on\('([^']+)'",l)
  if not m:continue
  ev=m[1];s+=f'| `{ev}` | '+('Not applicable' if ev in ['disconnect','error'] else 'NONE')+' | '+('Disconnect cleans buckets/presence; no authz needed' if ev=='disconnect' else 'Logs incoming error only' if ev=='error' else 'No role or target-resource check')+' | '+('No payload domain schema' if ev in ['disconnect','error'] else 'Zod envelope; task/cursor arbitrary where present')+f' | `{p}:{i}` |\n'
s+='\nOutbound-only notifications: workspace:users, cursor:updated, activity:new, workspace:suspended, error, plus the four relayed kanban:task-* events. Socket.io connection/disconnect are framework events. No document:join/write event remains on Socket.io; cursor:update targets document:<id> but no corresponding Socket.io document join handler exists. Server joins user:<localUserId> automatically for SCIM disconnects.\n\n## Hocuspocus protocol\n\n| Room / operation | Authentication | Membership/role/resource check | Evidence |\n|---|---|---|---|\n| document:<workspace>:<document>, read/update/awareness | Clerk token | Checks supplied workspace only; no document workspace comparison, no viewer write block | backend/src/services/yjs.service.ts:52 |\n| bare document ID, read/update | Clerk token | Resolves workspace if record exists; missing record leaves workspace empty and skips membership; no viewer write block | backend/src/services/yjs.service.ts:81 |\n| kanban:<workspace>, workspace:<workspace> | Clerk token | Membership only; no editor restriction; no durable server store for these room types | backend/src/services/yjs.service.ts:92 |\n| Existing connection after revoke/expiry/suspend | Initial Clerk token | No ongoing expiry/membership/active-user enforcement or cross-transport eviction | backend/src/services/yjs.service.ts:57 |\n\n## Interpretation\n\nWorkspace-owner checks are correctly present on workspace mutations, invitations and repository configuration, and document/snippet mutations derive workspace from their resource. Task moves check same-workspace destinations. Critical bypasses are D01/D02; missing relationship checks D05/D06/D08 and event checks D03/D04/D07 remain. Task assignee IDs are globally valid User IDs, without ensuring assignment membership; validate tenant assignment as part of Phase 1. Role update accepts OWNER and can demote the last owner; no single-owner/last-owner transaction invariant. SCIM token authority is workspace-wide (including assigning OWNER) rather than normal member role authority.\n'
Path('docs/AUTHZ_MATRIX.md').write_text(s)
print('REST rows',len(rows))
