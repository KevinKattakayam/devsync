import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { VirtuosoMockContext } from 'react-virtuoso';
import { VirtualizedKanbanControlsProof } from './combined-proof';

afterEach(cleanup);

it('renders a bounded task window with the existing per-card Move control', () => {
  const { container } = render(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 420, itemHeight: 50 }}>
      <VirtualizedKanbanControlsProof />
    </VirtuosoMockContext.Provider>,
  );
  const rows = container.querySelectorAll('[data-task-id]');
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThan(40);
  expect(screen.getByRole('combobox', { name: 'Move Task 1' })).toBeTruthy();
});
