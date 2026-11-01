const fs = require('fs'); const path = require('path'); const ts = require('../../backend/node_modules/typescript');
const results = { explicitAny: [], suppressions: [] };
function walk(folder) { for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
 const file = path.join(folder, entry.name);
 if (entry.isDirectory()) walk(file);
 else if (/\.(ts|tsx)$/.test(file)) {
  const text = fs.readFileSync(file, 'utf8'); const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function visit(node) { if (node.kind === ts.SyntaxKind.AnyKeyword) results.explicitAny.push({file, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}); ts.forEachChild(node, visit); } visit(source);
  text.split('\n').forEach((line, index) => { if (/@ts-(ignore|nocheck)|eslint-disable/.test(line)) results.suppressions.push({file, line: index + 1}); });
 }
}}
for (const folder of ['backend/src', 'backend/prisma', 'backend/testing', 'frontend/src', 'frontend/tests']) walk(folder);
fs.writeFileSync('docs/phase1c-evidence/remaining-type-escapes.json', JSON.stringify(results, null, 2) + '\n');
console.log(JSON.stringify({ explicitAny: results.explicitAny.length, suppressions: results.suppressions.length }));
