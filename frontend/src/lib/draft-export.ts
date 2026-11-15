import * as Y from 'yjs';
import { z } from 'zod';
const maxUpdateBytes = 8 * 1024 * 1024;
const maxFileCharacters = 12 * 1024 * 1024;
const envelope = z
  .object({
    format: z.literal('devsync-yjs-draft'),
    version: z.literal(1),
    principal: z.string().min(1).max(191),
    room: z.string().min(1).max(512),
    exportedAt: z.iso.datetime(),
    update: z
      .string()
      .max(Math.ceil(maxUpdateBytes / 3) * 4)
      .regex(/^[A-Za-z0-9+/]*={0,2}$/)
      .refine((value) => value.length % 4 === 0),
  })
  .strict();
/** Unencrypted recovery artifact. This never acknowledges disk or server storage. */
export function exportLocalDraft(document: Y.Doc, principal: string, room: string): string {
  const update = Y.encodeStateAsUpdate(document);
  if (update.byteLength > maxUpdateBytes) throw new Error('Draft exceeds export limit');
  let binary = '';
  for (let i = 0; i < update.length; i += 8192)
    binary += String.fromCharCode(...update.subarray(i, i + 8192));
  return JSON.stringify(
    envelope.parse({
      format: 'devsync-yjs-draft',
      version: 1,
      principal,
      room,
      exportedAt: new Date().toISOString(),
      update: btoa(binary),
    }),
  );
}
/** Detached inspection only; file metadata grants no workspace or upload authority. */
export function inspectLocalDraft(file: string, principal: string, room: string): Y.Doc {
  if (file.length > maxFileCharacters) throw new Error('Draft exceeds import limit');
  const input = envelope.parse(JSON.parse(file));
  if (input.principal !== principal || input.room !== room)
    throw new Error('Draft scope does not match');
  const binary = atob(input.update);
  if (binary.length > maxUpdateBytes) throw new Error('Draft exceeds import limit');
  const document = new Y.Doc();
  try {
    Y.applyUpdate(
      document,
      Uint8Array.from(binary, (character) => character.charCodeAt(0)),
    );
    return document;
  } catch {
    document.destroy();
    throw new Error('Draft update is invalid');
  }
}
