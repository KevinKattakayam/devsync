import { cp, mkdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export function assertFixtureMode(mode) {
  if (mode !== 'test') throw new Error('Fixture generation requires NODE_ENV=test');
}
export async function prepare() {
  assertFixtureMode(process.env.NODE_ENV);
  // Fixed, ignored destination; no arbitrary overwrite or environment-file copying.
  const target = resolve(frontend, '../.worktrees/frontend-fixture');
  await mkdir(target); // Refuse an existing artifact rather than reusing stale code.
  for (const path of [
    'src',
    'public',
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'postcss.config.mjs',
  ]) {
    await cp(resolve(frontend, path), resolve(target, path), { recursive: true });
  }
  await symlink(resolve(frontend, 'node_modules'), resolve(target, 'node_modules'), 'dir');
  let layout = await readFile(resolve(target, 'src/app/layout.tsx'), 'utf8');
  layout = layout.replace("import { ClerkProvider } from '@clerk/nextjs';", '');
  layout = layout.replace(/<ClerkProvider[\s\S]*?>/, '<>');
  layout = layout.replace('</ClerkProvider>', '</>');
  await writeFile(resolve(target, 'src/app/layout.tsx'), layout);
  // Keep the adapter's relative imports valid in its generated location.
  const adapter = (await readFile(resolve(frontend, 'testing/auth-provider.tsx'), 'utf8'))
    .replaceAll('../src/lib/api', '@/lib/api')
    .replaceAll('../src/types', '@/types');
  await writeFile(resolve(target, 'src/providers/auth-provider.tsx'), adapter);
  await writeFile(resolve(target, 'src/proxy.ts'), 'export function proxy() {}\n');
  for (const path of ['login', 'signup', 'sign-in', 'sign-up']) {
    await writeFile(
      resolve(target, `src/app/(auth)/${path}/[[...rest]]/page.tsx`),
      'export default function Login() { return <p>Authenticate through the isolated browser fixture.</p>; }\n',
    );
  }
  await writeFile(
    resolve(target, 'next.config.ts'),
    `
if (process.env.NODE_ENV !== 'development') throw new Error('Fixture frontend is development-only');
export default { env: {
  NEXT_PUBLIC_API_URL: 'http://127.0.0.1:5501/api',
  NEXT_PUBLIC_SOCKET_URL: 'http://127.0.0.1:5501',
  NEXT_PUBLIC_YJS_URL: 'ws://127.0.0.1:5501'
} };
`,
  );
  return target;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  console.log(await prepare());
}
