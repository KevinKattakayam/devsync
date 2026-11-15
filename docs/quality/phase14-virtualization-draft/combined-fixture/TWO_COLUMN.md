# Two-column fixture

`two-column.html` loads a synthetic board with 1,000 tasks in To do and an empty Done column. A single dnd-kit context wraps both independently scrolling Virtuoso lists; each column has a visible drop target and a persistent focusable host. The real task card supplies its drag adapter and Radix Move control. Both pointer drops and keyboard moves call the existing move guard against the current synthetic board. The fixture has no backend, Yjs persistence, permission-revocation lifecycle, or functional task drawer.

The component test uses `VirtuosoMockContext`; its bounded row assertion is not a browser measurement. Browser cross-column dragging, focus, cancellation, scrolling and accessibility remain unverified. For local inspection, use the existing `vite.config.mjs` and temporary Virtuoso 4.18.21 installation described in README.md, serve this directory on port 3419, and open `/two-column.html`. No browser acceptance is claimed. Phase 14 remains incomplete.
