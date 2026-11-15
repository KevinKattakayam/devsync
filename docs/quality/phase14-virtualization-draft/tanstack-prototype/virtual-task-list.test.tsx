import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { Task } from '@/types';
import { VirtualTaskList } from './virtual-task-list';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('keeps a thousand-task fixture bounded and exposes each rendered item’s position', () => {
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 300, 500),
  );
  const tasks = Array.from({ length: 1000 }, (_, index) => ({ id: `task-${index}` }) as Task);
  render(
    <VirtualTaskList
      tasks={tasks}
      columnName="To do"
      pinnedIds={['task-900']}
      renderTask={(task) => <button>{task.id}</button>}
    />,
  );
  const rows = screen.getAllByRole('listitem');
  expect(rows.length).toBeLessThan(30);
  expect(screen.getByRole('button', { name: 'task-900' })).toBeTruthy();
  expect(rows.find((row) => row.textContent === 'task-900')?.getAttribute('aria-posinset')).toBe(
    '901',
  );
  expect(rows[0].getAttribute('aria-setsize')).toBe('1000');
});

it('retains a focused task when its position changes', () => {
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(500);
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(300);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 300, 140),
  );
  const tasks = Array.from({ length: 100 }, (_, index) => ({ id: `task-${index}` }) as Task);
  const list = (items: Task[]) => (
    <VirtualTaskList
      tasks={items}
      columnName="To do"
      pinnedIds={['task-90']}
      renderTask={(task) => <button>{task.id}</button>}
    />
  );
  const { rerender } = render(list(tasks));
  const task = screen.getByRole('button', { name: 'task-90' });
  task.focus();
  rerender(list([tasks[90], ...tasks.filter((item) => item.id !== 'task-90')]));
  expect(document.activeElement).toBe(task);
  expect(task.closest('[role="listitem"]')?.getAttribute('aria-posinset')).toBe('1');
});
