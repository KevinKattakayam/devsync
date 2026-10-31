import StarterKit from '@tiptap/starter-kit';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import Highlight from '@tiptap/extension-highlight';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { Prisma } from '@prisma/client';
import * as Y from 'yjs';

export const documentExtensions = [StarterKit, TaskList, TaskItem, Highlight, Image, TableKit];
export function legacyDocument(content: unknown): Y.Doc {
  return TiptapTransformer.toYdoc(content ?? { type: 'doc', content: [{ type: 'paragraph' }] }, 'default', documentExtensions);
}
export function projectDocument(document: Y.Doc): Prisma.InputJsonValue {
  return TiptapTransformer.fromYdoc(document, 'default') as Prisma.InputJsonValue;
}
