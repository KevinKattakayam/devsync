import { spawnSync } from 'child_process';
import { randomBytes } from 'crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createWorkspaceZip } from '../services/workspace-archive-zip';

test('ZIP contains fixed paths and a manifest matching the file bytes', async () => {
  const input = { content: Buffer.from('Hello'), title: '../../private' };
  const zip = await createWorkspaceZip([input], Buffer.from('tasks'));
  const directory = mkdtempSync(join(tmpdir(), 'devsync-archive-test-'));
  try {
    const file = join(directory, 'test.zip');
    writeFileSync(file, zip);
    const inspect = spawnSync(
      'python3',
      [
        '-c',
        'import sys,zipfile,json,hashlib; z=zipfile.ZipFile(sys.argv[1]); m=json.loads(z.read("manifest.json")); print(json.dumps({"names": z.namelist(), "valid": all(hashlib.sha256(z.read(f["path"])).hexdigest()==f["sha256"] for f in m["files"])}))',
        file,
      ],
      { encoding: 'utf8', timeout: 5000 },
    );
    expect(inspect.status).toBe(0);
    expect(JSON.parse(inspect.stdout)).toEqual({
      names: ['manifest.json', 'documents/000001.md', 'tasks/tasks.csv'],
      valid: true,
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
test('rejects oversized content before producing an archive', async () => {
  await expect(
    createWorkspaceZip([{ content: Buffer.alloc(256 * 1024 + 1) }], Buffer.alloc(0)),
  ).rejects.toThrow();
});

test('rejects an incompressible ZIP that exceeds the output bound', async () => {
  const documents = Array.from({ length: 32 }, () => ({ content: randomBytes(256 * 1024) }));
  await expect(createWorkspaceZip(documents, Buffer.alloc(0))).rejects.toThrow('output limit');
}, 20000);
