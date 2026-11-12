import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { VirtuosoMockContext } from 'react-virtuoso';
import { InterruptionFixture } from './interruption';

afterEach(cleanup);
it('renders bounded real task controls in a persistent navigation host', () => {
  const { container } = render(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 420, itemHeight: 100 }}>
      <InterruptionFixture />
    </VirtuosoMockContext.Provider>,
  );
  const rows = container.querySelectorAll('[data-row]').length;
  expect(rows).toBeGreaterThan(0);
  expect(rows).toBeLessThan(40);
  expect(screen.getByRole('button', { name: 'Drag Task 1' })).toBeTruthy();
  expect(screen.getByRole('combobox', { name: 'Move Task 1' })).toBeTruthy();
  expect(screen.getByRole('group', { name: 'Task navigation' })).toBeTruthy();
});
