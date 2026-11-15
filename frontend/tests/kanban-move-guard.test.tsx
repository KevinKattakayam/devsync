import { expect, it } from 'vitest';
import { findMoveTarget } from '../src/components/kanban/move-guard';
import type { Board } from '../src/types';

const task = { id: 't', title: 'Task', columnId: 'a', position: 3, priority: 'MEDIUM', labels: [] };
const boards = [
  {
    id: 'b',
    columns: [
      { id: 'a', tasks: [task] },
      { id: 'b', tasks: [] },
    ],
  },
] as unknown as Board[];

it('uses the current task and refuses deleted tasks, revoked permission and invalid destinations', () => {
  expect(findMoveTarget(boards, 't', 'b', true, false)).toEqual(task);
  expect(findMoveTarget(boards, 'missing', 'b', true, false)).toBeNull();
  expect(findMoveTarget(boards, 't', 'b', false, false)).toBeNull();
  expect(findMoveTarget(boards, 't', 'b', true, true)).toBeNull();
  expect(findMoveTarget(boards, 't', 'missing', true, false)).toBeNull();
  expect(findMoveTarget(boards, 't', 'a', true, false)).toBeNull();
});

it('returns the latest task and prevents moves to a different board', () => {
  const updated = { ...task, title: 'Updated after drag started', position: 9 };
  const current = [
    {
      id: 'b',
      columns: [
        { id: 'a', tasks: [updated] },
        { id: 'b', tasks: [] },
      ],
    },
    { id: 'other', columns: [{ id: 'foreign', tasks: [] }] },
  ] as unknown as Board[];
  expect(findMoveTarget(current, 't', 'b', true, false)).toEqual(updated);
  expect(findMoveTarget(current, 't', 'foreign', true, false)).toBeNull();
  expect(findMoveTarget(current, 'local:pending', 'b', true, false)).toBeNull();
});
