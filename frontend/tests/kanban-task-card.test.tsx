import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { KanbanTaskCard } from '../src/components/kanban/task-card';

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

it('preserves task activation, native drag and the accessible Move control', () => {
  const onOpen = vi.fn();
  const onDragStart = vi.fn();
  const onDragEnd = vi.fn();
  render(
    <KanbanTaskCard
      task={{
        id: 't',
        title: 'A task',
        columnId: 'c',
        priority: 'MEDIUM',
        position: 0,
        labels: [],
      }}
      columns={[
        { id: 'c', name: 'Todo' },
        { id: 'd', name: 'Done' },
      ]}
      canWrite
      busy={false}
      onOpen={onOpen}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onMove={vi.fn()}
    />,
  );
  const title = screen.getByRole('button', { name: 'A task' });
  fireEvent.click(title);
  expect(onOpen).toHaveBeenCalledWith(title);
  const group = screen.getByRole('group', { name: 'A task' });
  expect(group.getAttribute('draggable')).toBe('true');
  fireEvent.dragStart(group);
  expect(group.className).toContain('opacity-50');
  fireEvent.dragEnd(group);
  expect(group.className).not.toContain('opacity-50');
  expect(onDragStart).toHaveBeenCalledOnce();
  expect(onDragEnd).toHaveBeenCalledOnce();
  expect(screen.getByRole('combobox', { name: 'Move A task' })).toBeTruthy();
});

it('hides the Move control and disables dragging for a viewer', () => {
  render(
    <KanbanTaskCard
      task={{
        id: 't',
        title: 'A task',
        columnId: 'c',
        priority: 'MEDIUM',
        position: 0,
        labels: [],
      }}
      columns={[{ id: 'c', name: 'Todo' }]}
      canWrite={false}
      busy={false}
      onOpen={vi.fn()}
      onDragStart={vi.fn()}
      onDragEnd={vi.fn()}
      onMove={vi.fn()}
    />,
  );
  expect(screen.getByRole('group', { name: 'A task' }).getAttribute('draggable')).toBe('false');
  expect(screen.queryByRole('combobox', { name: 'Move A task' })).toBeNull();
});

it('moves through the Radix control using the keyboard', async () => {
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  const user = userEvent.setup();
  const onMove = vi.fn();
  render(
    <KanbanTaskCard
      task={{
        id: 't',
        title: 'A task',
        columnId: 'c',
        priority: 'MEDIUM',
        position: 0,
        labels: [],
      }}
      columns={[
        { id: 'c', name: 'Todo' },
        { id: 'd', name: 'Done' },
      ]}
      canWrite
      busy={false}
      onOpen={vi.fn()}
      onDragStart={vi.fn()}
      onDragEnd={vi.fn()}
      onMove={onMove}
    />,
  );
  screen.getByRole('combobox', { name: 'Move A task' }).focus();
  await user.keyboard('{ArrowDown}');
  await screen.findByRole('option', { name: 'Done' });
  await user.keyboard('{ArrowDown}{Enter}');
  expect(onMove).toHaveBeenCalledWith('d');
});
