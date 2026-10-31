import tseslint from 'typescript-eslint';

// Syntax-aware type checking remains tsc's job. Lint enforces syntax correctness
// for every existing TS file without inventing exemptions for audited legacy code.
export default tseslint.config({
  files: ['src/**/*.ts', 'prisma/**/*.ts'],
  languageOptions: { parser: tseslint.parser },
  rules: { 'constructor-super': 'error', 'no-unreachable': 'error', 'no-constant-condition': 'error', 'no-debugger': 'error', 'no-dupe-args': 'error', 'no-dupe-else-if': 'error', 'no-unsafe-finally': 'error', 'valid-typeof': 'error' },
});
