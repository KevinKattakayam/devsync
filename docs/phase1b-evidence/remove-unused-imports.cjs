const fs=require('fs');const ts=require('../../frontend/node_modules/typescript');
const rows=fs.readFileSync('docs/phase1b-evidence/reliability-resumed-frontend-lint.log','utf8').split('\n');
const unused=new Map();let file;
for(const row of rows){if(row.startsWith('/home/kevin/devsync/frontend/'))file=row.trim();const m=row.match(/'([^']+)' is defined but never used/);if(m&&file){if(!unused.has(file))unused.set(file,new Set());unused.get(file).add(m[1]);}}
const printer=ts.createPrinter();
for(const [path,names] of unused){let text=fs.readFileSync(path,'utf8');const source=ts.createSourceFile(path,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);const edits=[];
for(const node of source.statements){if(!ts.isImportDeclaration(node)||!node.importClause)continue;const c=node.importClause;const named=c.namedBindings;if(!named||!ts.isNamedImports(named))continue;const kept=named.elements.filter(e=>!names.has(e.name.text));if(kept.length===named.elements.length)continue;
let replacement='';if(kept.length||c.name){const clause=ts.factory.updateImportClause(c,c.isTypeOnly,c.name,kept.length?ts.factory.updateNamedImports(named,kept):undefined);const updated=ts.factory.updateImportDeclaration(node,node.modifiers,clause,node.moduleSpecifier,node.attributes);replacement=printer.printNode(ts.EmitHint.Unspecified,updated,source);}
edits.push({start:node.getStart(source),end:node.end,replacement});}
for(const edit of edits.sort((a,b)=>b.start-a.start))text=text.slice(0,edit.start)+edit.replacement+text.slice(edit.end);fs.writeFileSync(path,text);}
