import { preflightSnippet as browserPreflight } from '../../../frontend/src/lib/snippet-preflight';
import { preflightSnippet, redactSnippetText, safetyMask } from '../security/snippet-preflight';
// All detector fixtures are synthetic, assembled in memory, and never valid credentials.
const fixture = () => 'gh' + 'p_' + 'SyntheticFixture'.repeat(3);
it('masks values completely across fields and returns only types/constant previews', () => {
  const synthetic = fixture();
  const result = preflightSnippet({
    title: synthetic,
    description: `api_key="${'fictional'.repeat(3)}"`,
    language: 'text',
    code: `const key = "${synthetic}";`,
  });
  expect(JSON.stringify(result).includes(synthetic)).toBe(false);
  expect(
    result.findings.every(
      (f) =>
        Object.keys(f).sort().join(',') === 'maskedPreview,type' &&
        f.maskedPreview === safetyMask(f.type),
    ),
  ).toBe(true);
  expect(result.findings.map((f) => f.type).sort()).toEqual([
    'credential-assignment',
    'github-token',
  ]);
  expect(preflightSnippet(result.content).findings).toHaveLength(0);
});
it('handles private key blocks including truncated blocks without retaining their body', () => {
  const body = 'OnlySyntheticMaterial'.repeat(4);
  for (const end of ['', '\n-----END PRIVATE KEY-----']) {
    const result = redactSnippetText(`-----BEGIN PRIVATE KEY-----\n${body}${end}`);
    expect(result.text.includes(body)).toBe(false);
    expect(result.findings.map((f) => f.type)).toEqual(['private-key']);
  }
});
it('handles AWS-style identifiers, bearer credentials, provider-style keys and credential URLs', () => {
  const values = [
    'AK' + 'IA' + 'EXAMPLE1'.repeat(2),
    'Bearer ' + 'SyntheticOnly'.repeat(2),
    'sk-' + 'SyntheticOnly'.repeat(3),
    'https://example-user:' + 'fictional-password' + '@example.invalid',
  ];
  for (const value of values) {
    const r = redactSnippetText(value);
    expect(r.findings.length > 0).toBe(true);
    expect(r.text.includes(value)).toBe(false);
  }
});
it('leaves placeholders and ordinary code alone; bounds work and does not execute HTML/code', () => {
  const code =
    'const token = process.env.TOKEN;\nconst answer = 42;\n<script>not executed</script>';
  expect(redactSnippetText(code).text === code).toBe(true);
  expect(redactSnippetText(code).findings).toHaveLength(0);
  expect(() => redactSnippetText('x'.repeat(256 * 1024 + 1))).toThrow('input limit');
  expect(redactSnippetText('x'.repeat(256 * 1024)).findings).toHaveLength(0);
});
it('masks entire quoted and unquoted assignments including punctuation and spaces', () => {
  const value = 'Synthetic$punctuation!with spaces';
  for (const input of [
    `PASSWORD="${value}"`,
    `password='${value}'`,
    `secret=${value.split(' ').join('_')}`,
  ]) {
    const r = redactSnippetText(input);
    expect(r.findings.map((f) => f.type)).toEqual(['credential-assignment']);
    expect(r.text.includes('Synthetic')).toBe(false);
    expect(r.text.includes('punctuation')).toBe(false);
    expect(r.text.includes('spaces')).toBe(false);
  }
});

it('keeps browser/server behavior equal across redaction, clean and boundary fixtures', () => {
  for (const code of [
    fixture(),
    'password="Synthetic$with punctuation"',
    'const value = 42;',
    'x'.repeat(256 * 1024),
  ]) {
    const input = {
      title: 'Parity fixture',
      language: 'text',
      code,
      description: 'token=' + fixture(),
    };
    expect(
      JSON.stringify(browserPreflight(input)) === JSON.stringify(preflightSnippet(input)),
    ).toBe(true);
  }
});
