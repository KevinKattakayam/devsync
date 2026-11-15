import { TextDecoder } from 'util';
import { z } from 'zod';
import { BadRequestError } from '../utils/errors';
import type { TenantTransaction } from '../lib/tenant-prisma';

// Version 1 intentionally covers scalar task fields only; labels and task keys are excluded.
const headers = [
  'version',
  'columnId',
  'title',
  'description',
  'priority',
  'assigneeId',
  'dueDate',
] as const;
const maxBytes = 1024 * 1024;
const maxRows = 1000;
const schema = z
  .object({
    columnId: z.string().min(1).max(191),
    title: z.string().min(1).max(200),
    description: z.string().max(2000),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']),
    assigneeId: z.string().max(191),
    dueDate: z.union([z.literal(''), z.string().datetime()]),
  })
  .strict();
export type CsvTask = z.infer<typeof schema>;
const invalid = (): never => {
  throw new BadRequestError('Invalid task CSV');
};
function validTask(value: unknown): CsvTask {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return invalid();
  for (const field of Object.values(parsed.data))
    if (
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(field) ||
      Buffer.from(field, 'utf8').toString('utf8') !== field
    )
      return invalid();
  return parsed.data;
}
/** All data cells carry a literal apostrophe. Import removes exactly one, including for values that already begin with one. */
export function serializeTaskCsv(tasks: CsvTask[]): string {
  if (tasks.length > maxRows) return invalid();
  const rows = tasks.map((input) => {
    const task = validTask(input);
    return [
      '1',
      task.columnId,
      task.title,
      task.description,
      task.priority,
      task.assigneeId,
      task.dueDate,
    ]
      .map((value) => `"'${value.replace(/"/g, '""')}"`)
      .join(',');
  });
  const result = [headers.join(','), ...rows].join('\r\n') + '\r\n';
  if (Buffer.byteLength(result, 'utf8') > maxBytes) return invalid();
  return result;
}
export function parseTaskCsv(bytes: Uint8Array): CsvTask[] {
  if (bytes.byteLength > maxBytes) return invalid();
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return invalid();
  }
  const rows: string[][] = [];
  let row: string[] = [],
    field = '',
    quoted = false,
    closed = false,
    started = false;
  const pushField = () => {
    if (field.length > 4000) invalid();
    row.push(field);
    if (row.length > headers.length) invalid();
    field = '';
    closed = false;
    started = false;
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    if (rows.length > maxRows + 1) invalid();
    row = [];
  };
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"') {
        if (source[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else field += c;
    } else if (c === '"') {
      if (started || closed) invalid();
      quoted = true;
      started = true;
    } else if (c === ',') pushField();
    else if (c === '\r' || c === '\n') {
      if (c === '\r') {
        if (source[++i] !== '\n') invalid();
      }
      pushRow();
    } else {
      if (closed) invalid();
      started = true;
      field += c;
    }
    if (field.length > 4000) invalid();
  }
  if (quoted) return invalid();
  if (started || closed || field || row.length) pushRow();
  if (
    !rows.length ||
    rows[0].length !== headers.length ||
    rows[0].some((value, index) => value !== headers[index])
  )
    return invalid();
  return rows.slice(1).map((cells) => {
    if (cells.length !== headers.length || cells.some((value) => !value.startsWith("'")))
      return invalid();
    const [version, columnId, title, description, priority, assigneeId, dueDate] = cells.map(
      (value) => value.slice(1),
    );
    if (version !== '1') return invalid();
    return validTask({ columnId, title, description, priority, assigneeId, dueDate });
  });
}

/** Caller must authorize the workspace in this transaction. */
export async function exportWorkspaceTasksCsv(
  tx: TenantTransaction,
  workspaceId: string,
): Promise<string> {
  const tasks = await tx.task.findMany({
    where: { column: { board: { workspaceId } } },
    select: {
      columnId: true,
      title: true,
      description: true,
      priority: true,
      assigneeId: true,
      dueDate: true,
    },
    orderBy: [{ columnId: 'asc' }, { position: 'asc' }, { id: 'asc' }],
    take: 1001,
  });
  return serializeTaskCsv(
    tasks.map((task) => ({
      ...task,
      description: task.description ?? '',
      assigneeId: task.assigneeId ?? '',
      dueDate: task.dueDate?.toISOString() ?? '',
    })),
  );
}
