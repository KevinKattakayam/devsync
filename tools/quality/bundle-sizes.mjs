// On-disk production asset sizes, not transfer sizes or module-attributed analysis.
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { gzipSync, brotliCompressSync } from 'node:zlib';
const root = resolve(import.meta.dirname, '../..');
const assets = [];
async function visit(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await visit(path);
    else if (/\.(js|css)$/.test(entry.name)) {
      const content = await readFile(path);
      assets.push({
        path: path.slice(root.length + 1),
        bytes: content.length,
        gzipBytes: gzipSync(content).length,
        brotliBytes: brotliCompressSync(content).length,
      });
    }
  }
}
await visit(join(root, 'frontend/.next/static'));
assets.sort((a, b) => b.bytes - a.bytes);
await writeFile(
  join(root, 'docs/quality/bundle-sizes.json'),
  JSON.stringify(
    {
      scope:
        'Unique emitted production JS/CSS assets on disk; not initial-route transfer or module attribution',
      assets,
    },
    null,
    2,
  ) + '\n',
);
