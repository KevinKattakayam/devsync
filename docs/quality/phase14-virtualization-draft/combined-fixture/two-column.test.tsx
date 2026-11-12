import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { VirtuosoMockContext } from 'react-virtuoso';
import { TwoColumnFixture } from './two-column';

afterEach(cleanup);
it('renders two independently hosted columns and bounded real task controls', () => {
  const { container } = render(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 420, itemHeight: 100 }}>
      <TwoColumnFixture />
    </VirtuosoMockContext.Provider>,
  );
  expect(screen.getByRole('group', { name: 'To do tasks' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Done tasks' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Drag Task 1' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Move Task 1' })).toBeTruthy();
  expect(container.querySelectorAll('[data-drop-target]').length).toBe(2);
  const rows = container.querySelectorAll('[data-task-id]').length;
  expect(rows).toBeGreaterThan(0);
  expect(rows).toBeLessThan(40);
});
