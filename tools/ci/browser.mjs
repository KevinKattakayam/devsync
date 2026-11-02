import { spawn } from 'node:child_process';
const targets = {
  core: {},
  'ai-cost': { E2E_AI_COST: '1' },
  editor: { E2E_EDITOR: '1' },
  kanban: { E2E_KANBAN: '1' },
  settings: { E2E_SETTINGS: '1' },
  dashboard: { E2E_DASHBOARD: '1' },
  decisions: { E2E_DECISIONS: '1' },
  'snippet-safety': { E2E_SNIPPET_SAFETY: '1' },
  'async-digest': { E2E_ASYNC_DIGEST: '1' },
  shell: { E2E_SHELL: '1', E2E_SHELL_PASS: 'final' },
};
const target = process.argv[2];
if (!Object.hasOwn(targets, target)) throw new Error('Unknown browser target');
const child = spawn(process.execPath, ['--import', 'tsx', 'testing/run-browser.ts'], {
  cwd: 'backend',
  stdio: 'inherit',
  env: { ...process.env, NODE_ENV: 'test', LOG_LEVEL: 'warn', ...targets[target] },
});
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
