import { cleanup, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { VirtuosoMockContext } from 'react-virtuoso';
import { App } from '../src/virtuoso-overlay-poc';

afterEach(cleanup);
it('renders a bounded subset of the 1,000-item overlay fixture', () => {
  const { container } = render(
    <VirtuosoMockContext.Provider value={{ viewportHeight: 400, itemHeight: 40 }}>
      <App />
    </VirtuosoMockContext.Provider>,
  );
  const rows = container.querySelectorAll('[data-task]');
  expect(rows.length).toBeGreaterThan(0);
  expect(rows.length).toBeLessThan(40);
});
