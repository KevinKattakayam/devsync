import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
try {
  const build = JSON.parse(await readFile('/app/build-settings.json', 'utf8'));
  if (process.env.DEPLOYMENT_MODE && process.env.DEPLOYMENT_MODE !== build.mode)
    throw new Error('Runtime mode differs from image build');
  process.env.DEPLOYMENT_MODE = build.mode;
  if (build.mode !== 'local' && (!build.clerk || !process.env.CLERK_SECRET_KEY?.startsWith('sk_')))
    throw new Error('Missing production Clerk settings');
  if (
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY !== build.clerk
  )
    throw new Error('Public Clerk settings differ from the image build');
  const child = spawn(process.execPath, ['server.js'], { stdio: 'inherit', env: process.env });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.on('error', () => {
    console.error('Frontend executable failed');
    process.exitCode = 1;
  });
  child.on('exit', (code) => {
    process.exitCode = code ?? 1;
  });
} catch {
  console.error('Frontend deployment settings missing or inconsistent with image build');
  process.exitCode = 1;
}
