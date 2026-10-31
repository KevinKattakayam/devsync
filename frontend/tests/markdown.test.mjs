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

test('E02 treats ordinary HTML, handlers and malformed tags as inert text', () => {
  for (const attack of ['<img src=x onerror="alert(1)">', '<svg/onload=alert(1)>', '<script>alert(1)</script>', '<h1><iframe srcdoc="<script>alert(1)</script>"></iframe></h1>']) {
    const html = markdownToHtml(attack);
    assert.doesNotMatch(html, /<(?:img|svg|script|iframe)\b/i);
    assert.ok(html.includes('&lt;'));
  }
});

test('E02 escapes HTML inside headings, lists and table cells', () => {
  const html = markdownToHtml('# <img src=x onerror=alert(1)>\n- <svg/onload=alert(1)>\n| h |\n|---|\n| <iframe src=x> |');
  assert.doesNotMatch(html, /<(?:img|svg|iframe)\b/i);
  assert.ok(html.includes('<h1>'));
  assert.ok(html.includes('<table'));
});
