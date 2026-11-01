import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const css = await readFile(new URL('../src/app/globals.css', import.meta.url), 'utf8');
function luminance(hex) {
  return hex
    .match(/[a-f0-9]{2}/g)
    .map((part) => parseInt(part, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}
for (const selector of [':root', '.dark']) {
  test(`${selector} text, status and control tokens meet their WCAG AA contrast thresholds`, () => {
    const block = css.slice(css.indexOf(`${selector} {`)).split('}')[0];
    const tokens = Object.fromEntries(
      [...block.matchAll(/--([\w-]+): (#[a-f0-9]{6});/g)].map((match) => [match[1], match[2]]),
    );
    for (const [a, b, minimum] of [
      ['foreground', 'background', 4.5],
      ['muted-foreground', 'background', 4.5],
      ['muted-foreground', 'card', 4.5],
      ['muted-foreground', 'secondary', 4.5],
      ['primary-foreground', 'primary', 4.5],
      ['destructive-foreground', 'destructive', 4.5],
      ['success', 'card', 4.5],
      ['warning', 'card', 4.5],
      ['ring', 'background', 3],
      ['input', 'card', 3],
    ]) {
      assert.ok(tokens[a] && tokens[b], `${a}/${b} must be defined`);
      const [lo, hi] = [luminance(tokens[a]), luminance(tokens[b])].sort((x, y) => x - y);
      assert.ok((hi + 0.05) / (lo + 0.05) >= minimum, `${selector} ${a}/${b} needs ${minimum}:1`);
    }
  });
}
