import { randomBytes } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
for (const [directory, files] of [
  ['/state/admin', ['postgres-password']],
  ['/state/runtime', ['database-password', 'encryption-key']],
]) {
  await mkdir(directory, { recursive: true });
  for (const file of files) {
    try {
      await writeFile(`${directory}/${file}`, randomBytes(32).toString('hex'), {
        flag: 'wx',
        mode: 0o444,
      });
    } catch (error) {
      if (error.code !== 'EEXIST') throw new Error('Local secret initialization failed');
    }
  }
}
console.log('Local credentials initialized; values are not logged.');
