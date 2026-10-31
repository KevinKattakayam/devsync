import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/markdown.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
const { markdownToHtml } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);

test('code blocks and inline code escape HTML', () => {
  const html = markdownToHtml('```html\n<script>alert(1)</script>\n```\n`<iframe>`');
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('&lt;iframe&gt;'));
});
