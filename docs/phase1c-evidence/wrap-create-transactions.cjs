const fs=require('fs'),ts=require('../../backend/node_modules/typescript');
const groups={
 'document': {createDocument: "req.user!.userId, ['document.create', workspaceId], req.header('idempotency-key'), {title, parentId, icon}"},
 'snippet': {createSnippet: "req.user!.userId, ['snippet.create', workspaceId], req.header('idempotency-key'), data"},
 'task': {
   createBoard: "req.user!.userId, ['board.create', workspaceId], req.header('idempotency-key'), {name}",
   createColumn: "req.user!.userId, ['column.create', board.workspaceId, boardId], req.header('idempotency-key'), {name}",
   createTask: "req.user!.userId, ['task.create', workspaceId, columnId], req.header('idempotency-key'), {...data, dueDate}",
 },
 'workspace': {
   createWorkspace: "userId, ['workspace.create'], req.header('idempotency-key'), {name,description,icon}",
   inviteMember: "req.user!.userId, ['member.invite', workspaceId], req.header('idempotency-key'), {email,role}",
 },
 'github-repository': {connectRepository: "req.user!.userId, ['repository.create', workspaceId], req.header('idempotency-key'), data"},
};
for(const [file, functions] of Object.entries(groups)){
 const filename=`backend/src/controllers/${file}.controller.ts`,source=fs.readFileSync(filename,'utf8');
 const ast=ts.createSourceFile(filename,source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS), edits=[];
 for(const statement of ast.statements){
  if(!ts.isFunctionDeclaration(statement)||!statement.name||!functions[statement.name.text])continue;
  let count=0;
  function visit(node){
   if(ts.isCallExpression(node)&&['withWorkspaceAccess','withPrincipalAccess','withColumnAccess'].includes(node.expression.getText(ast))){
    const arrow=node.arguments.find(ts.isArrowFunction);
    if(!arrow)throw new Error('Missing transaction callback');
    const body=arrow.body, text=body.getText(ast);
    edits.push({start:body.getStart(ast),end:body.end,text:`idempotentCreate(tx, ${functions[statement.name.text]}, ${ts.isBlock(body)?'async ':''}() => ${text})`});count++;
   } else ts.forEachChild(node,visit);
  }
  visit(statement);if(count!==1)throw new Error(`Expected one primary policy in ${statement.name.text}, found ${count}`);
 }
 let output=source;
 for(const edit of edits.sort((a,b)=>b.start-a.start))output=output.slice(0,edit.start)+edit.text+output.slice(edit.end);
 output="import { idempotentCreate } from '../lib/create-idempotency';\n"+output;
 fs.writeFileSync(filename,output);console.log(`${filename}: ${edits.length} creates wrapped`);
}
