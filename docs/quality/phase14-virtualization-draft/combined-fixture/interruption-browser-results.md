# Kanban drag-interruption browser verification

Date: 2026-11-12
Environment: Local Linux, Chrome, Vite, Playwright

The isolated Virtuoso + dnd-kit interruption fixture passed all four
browser scenarios at 1440px and 390px.

- Delete and revoke scenarios passed at both widths.
- 1,000 synthetic tasks; 5–11 rendered rows.
- Focus host and scroller identity preserved.
- ScrollTop retained at 4000 before and after interruption.
- Active task references remained valid.
- Subsequent drag cancellation and keyboard Move passed.

These results apply only to the isolated fixture.
They do not verify real backend authorization, Yjs persistence,
API rejection, concurrent edits, or manual screen-reader behavior.
