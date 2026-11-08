// Real approved test accounts only. Password/MFA entry belongs to the user.
// No traces, screenshots, console/request payload capture or storage-state exports.
import {createRequire} from 'node:module';
import {writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const {HocuspocusProvider,HocuspocusProviderWebsocket}=require('@hocuspocus/provider');
const WebSocket=require('ws');const {io}=require('socket.io-client');const Y=require('yjs');
const frontend='http://localhost:3410',api='http://localhost:5410/api/v1';
const report={status:'waiting_for_local_stack',realProvider:true,credentialsOrTokensRecorded:false,screenshots:false,traces:false,checks:[]};
const output=new URL('../../docs/quality/identity-lifecycle/real-provider-smoke.json',import.meta.url);
function save(){writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
function checked(label,actual,expected){report.checks.push({label,actual,expected,passed:actual===expected});save();if(actual!==expected)throw new Error(label);}
async function until(check,ms=15000){const end=performance.now()+ms;while(performance.now()<end){if(await check())return;await new Promise(r=>setTimeout(r,250));}throw new Error('bounded wait');}
async function request(page,path,method='GET',data){return page.evaluate(async({api,path,method,data})=>{
 const token=await window.Clerk?.session?.getToken({skipCache:true});if(!token)return {status:0};
 const response=await fetch(api+path,{method,headers:{Authorization:`Bearer ${token}`,...(data===undefined?{}:{'Content-Type':'application/json'})},...(data===undefined?{}:{body:JSON.stringify(data)})});
 return {status:response.status,data:await response.json().catch(()=>null)};
},{api,path,method,data});}
let browser;const wires=[];
try{
 save();await until(async()=>{try{return (await fetch(frontend+'/healthz')).ok;}catch{return false;}},600000);
 browser=await chromium.launch({executablePath:'/usr/bin/google-chrome',headless:false,chromiumSandbox:true});
 const a=await browser.newContext(),b=await browser.newContext();
 const owner=await a.newPage(),recipient=await b.newPage();
 await Promise.all([owner.goto(frontend+'/sign-in'),recipient.goto(frontend+'/sign-in')]);
 for(const [page,label] of [[owner,'Approved account A — owner'],[recipient,'Approved account B — recipient']])await page.evaluate(label=>{document.title=label;},label);
 report.status='waiting_for_two_real_signins';save();console.log('Two isolated Chrome windows are ready. Sign in with approved accounts A and B. No credentials are recorded.');
 await until(async()=>{try{return await owner.evaluate(()=>!!window.Clerk?.session)&&await recipient.evaluate(()=>!!window.Clerk?.session);}catch{return false;}},600000);
 const [actor,target]=await Promise.all([request(owner,'/auth/me'),request(recipient,'/auth/me')]);
 checked('real account A API identity',actor.status,200);checked('real account B API identity',target.status,200);checked('distinct approved identities',actor.data.id!==target.data.id,true);
 checked('fixture login route absent',(await fetch('http://localhost:5410/__test/login',{method:'POST'})).status,404);
 report.status='running_real_provider_checks';save();
 const workspace=await request(owner,'/workspaces','POST',{name:'Identity smoke '+randomUUID().slice(0,8),description:'Approved two-account identity smoke; no production content'});
 checked('workspace setup',workspace.status,201);const w=workspace.data.id;report.workspaceId=w;save();
 const document=await request(owner,`/workspaces/${w}/documents`,'POST',{title:'Identity smoke private document'});checked('owner document create',document.status,201);const d=document.data.id;
 const invitation=await request(owner,`/workspaces/${w}/invitations`,'POST',{email:target.data.email,role:'VIEWER'});checked('verified-recipient invitation create',invitation.status,201);
 await recipient.goto(`${frontend}/invitations/${invitation.data.id}`);await recipient.getByRole('button',{name:'Accept invitation'}).click();
 await recipient.getByText('Invitation accepted. Your role is VIEWER.').waitFor({timeout:20000});checked('real browser invitation acceptance',true,true);
 checked('viewer document read',(await request(recipient,`/documents/${d}`)).status,200);
 checked('viewer document mutation denied',(await request(recipient,`/documents/${d}`,'PATCH',{title:'must not persist'})).status,403);
 checked('viewer owner lifecycle denied',(await request(recipient,`/../v2/workspaces/${w}/lifecycle`)).status,403);
 const token=await recipient.evaluate(()=>window.Clerk.session.getToken({skipCache:true}));
 const doc=new Y.Doc();const socket=new HocuspocusProviderWebsocket({url:'ws://localhost:5410/yjs',WebSocketPolyfill:WebSocket});
 const provider=new HocuspocusProvider({websocketProvider:socket,name:`document:${w}:${d}`,document:doc,token});provider.attach();wires.push(()=>{provider.destroy();socket.destroy();doc.destroy();});
 await until(()=>provider.synced);checked('real viewer Yjs read-only admission',provider.authorizedScope==='read-only',true);
 const before=await request(owner,`/documents/${d}`);
 doc.getMap('unauthorized-smoke').set('attempt','must not persist');await new Promise(r=>setTimeout(r,1000));
 const after=await request(owner,`/documents/${d}`);
 checked('viewer cannot persist Yjs mutation',Number.isInteger(before.data.crdtRevision)&&after.data.crdtRevision===before.data.crdtRevision&&JSON.stringify(after.data.content)===JSON.stringify(before.data.content),true);
 const presence=io('http://localhost:5410',{transports:['websocket'],auth:{token},reconnection:false});wires.push(()=>presence.disconnect());
 await until(()=>presence.connected);let joined=false;presence.on('workspace:users',()=>{joined=true;});presence.emit('workspace:join',{workspaceId:w,userName:'approved-test-recipient'});await until(()=>joined);
 checked('real viewer Socket.IO room admission',joined,true);
 const current=await request(owner,`/workspaces/${w}`);const member=current.data.members.find(m=>m.user.id===target.data.id);
 let closed=false;provider.on('disconnect',()=>{closed=true;});
 checked('owner removes invited member',(await request(owner,`/workspaces/${w}/members/${member.id}`,'DELETE')).status,200);
 await until(()=>!presence.connected&&closed,15000);checked('removed user loses Yjs and Socket.IO access',true,true);
 checked('removed user API denied',(await request(recipient,`/documents/${d}`)).status,403);
 checked('Clerk session inventory is real provider-backed',(await request(owner,'/../v2/account/sessions')).status,200);
 const replay=await owner.evaluate(()=>window.Clerk.session.getToken({skipCache:true}));
 const payload=JSON.parse(Buffer.from(replay.split('.')[1],'base64url').toString());checked('fresh token has revocation-test lifetime',payload.exp*1000-Date.now()>30000,true);
 const ownerDoc=new Y.Doc(),ownerSocket=new HocuspocusProviderWebsocket({url:'ws://localhost:5410/yjs',WebSocketPolyfill:WebSocket});
 const ownerProvider=new HocuspocusProvider({websocketProvider:ownerSocket,name:`document:${w}:${d}`,document:ownerDoc,token:replay});ownerProvider.attach();wires.push(()=>{ownerProvider.destroy();ownerSocket.destroy();ownerDoc.destroy();});
 const ownerPresence=io('http://localhost:5410',{transports:['websocket'],auth:{token:replay},reconnection:false});wires.push(()=>ownerPresence.disconnect());
 await until(()=>ownerProvider.synced&&ownerPresence.connected);let ownerClosed=false;ownerProvider.on('disconnect',()=>{ownerClosed=true;});
 ownerPresence.emit('workspace:join',{workspaceId:w,userName:'approved-test-owner'});
 await owner.goto(frontend+'/settings');await owner.getByRole('button',{name:'Revoke current session'}).click();await owner.getByRole('button',{name:'Confirm session revocation'}).click();
 await until(async()=>{const response=await fetch(api+'/auth/me',{headers:{Authorization:`Bearer ${replay}`}});return response.status===401;},12000);
 checked('provider-revoked token cannot replay API identity',true,true);
 await until(()=>ownerClosed&&!ownerPresence.connected,12000);checked('provider revocation evicts real Yjs and Socket.IO',true,true);
 checked('revocation enforced before JWT expiry',payload.exp*1000>Date.now(),true);
 report.status='passed';save();console.log('Real two-account identity smoke passed. Only status checks and the new test workspace reference were recorded.');
}catch{
 report.status=report.status.startsWith('waiting')?'external_signin_action_required':'failed';report.failure='A bounded login or status assertion did not complete; no provider exception details, credentials or payloads recorded.';save();console.log('Real identity smoke did not complete; see the redacted status record.');process.exitCode=1;
}finally{for(const close of wires)close();await browser?.close();}
