import { parseTaskCsv, serializeTaskCsv } from '../services/task-csv';

const task = {
  columnId: 'col1',
  title: '=SUM(1,2)',
  description: 'Quote "yes",\nnext',
  priority: 'HIGH' as const,
  assigneeId: '',
  dueDate: '',
};
test('round trips quoted, multiline and formula-like values safely', () => {
  const csv = serializeTaskCsv([task]);
  expect(csv).toContain("'=SUM(1,2)");
  expect(parseTaskCsv(Buffer.from(csv))).toEqual([task]);
});
test('rejects invalid UTF-8, malformed CSV, wrong and duplicate headers', () => {
  for (const bytes of [
    Buffer.from([0xff]),
    Buffer.from('version,title,title\n'),
    Buffer.from('"unclosed'),
    Buffer.from('x,y\r\n'),
  ])
    expect(() => parseTaskCsv(bytes)).toThrow();
});
test('enforces row, field and value limits', () => {
  expect(() => serializeTaskCsv(Array(1001).fill(task))).toThrow();
  expect(() => serializeTaskCsv([{ ...task, title: 'x'.repeat(201) }])).toThrow();
  expect(() =>
    serializeTaskCsv([{ ...task, priority: 'INVALID' } as unknown as typeof task]),
  ).toThrow();
  expect(() => parseTaskCsv(Buffer.alloc(1024 * 1024 + 1))).toThrow();
});
