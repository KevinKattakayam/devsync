import { Readable } from 'stream';
import { ZipFile } from 'yazl';
import { BadRequestError } from '../utils/errors';
import { buildWorkspaceArchiveManifest } from './workspace-archive-manifest';

/** ZIP is built in memory and returned only after successful finalization. */
export async function createWorkspaceZip(
  documents: Array<{ content: Buffer }>,
  tasks: Buffer,
): Promise<Buffer> {
  const manifest = buildWorkspaceArchiveManifest(documents, tasks);
  const contents = [...documents.map((item) => item.content), tasks];
  return new Promise<Buffer>((resolve, reject) => {
    const zip = new ZipFile();
    const output = zip.outputStream as Readable;
    const chunks: Buffer[] = [];
    let total = 0,
      settled = false;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      output.destroy();
      reject(error);
    };
    const timer = setTimeout(
      () => fail(new BadRequestError('Workspace archive timed out')),
      10_000,
    );
    zip.on('error', fail);
    output.on('error', fail);
    output.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > 8 * 1024 * 1024)
        return fail(new BadRequestError('Workspace archive exceeds output limit'));
      chunks.push(chunk);
    });
    output.on('end', () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(Buffer.concat(chunks, total));
    });
    try {
      const options = { mtime: new Date('1980-01-01T00:00:00.000Z'), forceDosTimestamp: true };
      zip.addBuffer(Buffer.from(JSON.stringify(manifest)), 'manifest.json', options);
      manifest.files.forEach((file, index) => zip.addBuffer(contents[index], file.path, options));
      zip.end();
    } catch (error) {
      fail(error instanceof Error ? error : new Error('Archive generation failed'));
    }
  });
}
