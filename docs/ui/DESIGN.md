# DevSync UI foundation — Phase 2

## Direction and reference study

Fast, focused, calm and keyboard-first. Neutral graphite replaces tinted glass; blue is reserved for actions and focus. Hierarchy comes from alignment, type and space. Dark is the first-visit default; light is equally supported. System follows the OS through next-themes. Theme choice persists locally and never changes authorization.

Patterns reviewed (2026-11-01): [Linear](https://linear.app/features) informs compact navigation and hierarchy; [Notion](https://www.notion.com/product) informs document organization; [Raycast](https://www.raycast.com) informs searchable commands and visible keyboard cues; [Vercel](https://vercel.com/design) informs restrained surfaces and typography; [GitHub Primer](https://primer.style) informs semantic tokens and accessible controls. These are our design interpretations, not copied assets or claims of equivalent capabilities. No branding is reused.

The before/current screenshots show a mobile sidebar consuming 240px, gradients competing with content and tiny metadata. Foundation delivery covers this specification, tokens and reusable controls. The existing app shell still needs structural replacement; palette changes alone do not complete that redesign.

## Color and contrast

CSS variables in globals.css are the palette source, mapped through Tailwind v4 `@theme inline`. New components use semantic classes exclusively. Existing product components with fixed colors must migrate with their later redesign. Legacy utility names now resolve to flat surfaces.

Ratios below are calculated from the actual opaque sRGB tokens using WCAG relative luminance, rounded to two decimals. Normal text requires 4.5:1; control boundaries/focus require 3:1. These are token calculations, not certification of existing screens. Decorative `border` is intentionally subtle; use `input` for control boundaries. Disabled controls are exempt. Success/warning/error need text or icons as well as color.

| Theme | Pair                                     | Colors            | Contrast |
| ----- | ---------------------------------------- | ----------------- | -------- |
| Light | `foreground` / `background`              | #202124 / #fafafa | 15.42:1  |
| Light | `muted-foreground` / `background`        | #595d66 / #fafafa | 6.32:1   |
| Light | `muted-foreground` / `card`              | #595d66 / #ffffff | 6.60:1   |
| Light | `muted-foreground` / `secondary`         | #595d66 / #eeeeef | 5.69:1   |
| Light | `primary-foreground` / `primary`         | #ffffff / #245ad1 | 6.07:1   |
| Light | `destructive-foreground` / `destructive` | #ffffff / #b42333 | 6.50:1   |
| Light | `success` / `card`                       | #167047 / #ffffff | 6.10:1   |
| Light | `warning` / `card`                       | #855500 / #ffffff | 6.37:1   |
| Light | `ring` / `background`                    | #245ad1 / #fafafa | 5.82:1   |
| Light | `input` / `card`                         | #7b7f88 / #ffffff | 4.01:1   |
| Dark  | `foreground` / `background`              | #eceef1 / #141517 | 15.72:1  |
| Dark  | `muted-foreground` / `background`        | #a6abb5 / #141517 | 7.93:1   |
| Dark  | `muted-foreground` / `card`              | #a6abb5 / #1b1c1f | 7.39:1   |
| Dark  | `muted-foreground` / `secondary`         | #a6abb5 / #2a2c31 | 6.06:1   |
| Dark  | `primary-foreground` / `primary`         | #142344 / #9cbeff | 8.29:1   |
| Dark  | `destructive-foreground` / `destructive` | #48131d / #ffadb5 | 8.58:1   |
| Dark  | `success` / `card`                       | #7ed6a8 / #1b1c1f | 9.79:1   |
| Dark  | `warning` / `card`                       | #ebc374 / #1b1c1f | 10.22:1  |
| Dark  | `ring` / `background`                    | #9cbeff / #141517 | 9.76:1   |
| Dark  | `input` / `card`                         | #747a85 / #1b1c1f | 3.95:1   |

`card` groups content only when a surface is needed. `popover` is for floating controls; `sidebar` distinguishes navigation. Selected and hover rows use `secondary`. Focus uses a 2px ring with 3px offset. Never place body text on the scrim.

## Typography

One UI face: Geist Sans, weights 400/500/600; one code face: Geist Mono, 400/500. The Geist package uses `next/font/local`; both fonts are served locally without Google requests at build/runtime. Tailwind font-sans/font-mono map to their generated variables. Body/controls: 14px/20px; metadata/Kbd: 12px/16px; section titles: 20px/28px; page titles: 28px/36px. No gradient text or excessive weight. Prose wraps; code scrolls within its own region.

## Geometry and surfaces

4px spacing unit: 4/8px within controls, 12px between related controls, 16px between form fields, 24px between groups, 32px desktop page padding and 16px mobile padding. Controls and icon targets are at least 36px; preserve at least 24px target size/spacing on touch interfaces. Radius: 4px badges/Kbd, 6px controls, 8px menus, 12px dialogs; circular avatars. Pages/lists have no shadow; floating panels use shadow-popover. Borders divide major regions and identify inputs, not every row.

## Motion and icons

100ms hover, 150ms opacity/selection and 200ms drawer motion, ease-out. Animate opacity or a small transform; no bounce, continuous decoration or transition-all. Reduced-motion removes nonessential animation/transitions including skeleton pulse. Lucide is the only icon set, normally 16px. Decorative icons are aria-hidden. IconButton requires a label; tooltip is supplemental.

## Component and keyboard contract

Radix primitives own modal focus trapping/restoration, Escape, menu/select navigation, checkbox/switch state and tabs. Native inputs/buttons retain native semantics. Button variants: primary/secondary/ghost/destructive; compact/default sizes. Pending actions announce busy and prevent duplicate activation. Invalid fields use aria-invalid with a caller-associated error description. Tooltips work on focus. Dialogs/drawers require title and description. Toasts announce actual outcomes only. Skeletons are decorative; enclosing regions provide a loading label.

The command control filters supplied actions, supports arrows/Enter/Escape, announces empty results and keeps active options visible. Product data fetching and permission-aware creation await shell integration. Gallery examples are explicitly demonstration data, without backend calls. `/design-system` is development-only and returns not-found in production. Theme selection supports light/dark/system; interactive examples expose focus/open/selected states. The gallery is not an authenticated shell capture.

## App-shell layout model — implementation deferred

Desktop: 240px collapsible navigation (56px rail), 48px topbar and flexible min-width:0 content. Sidebar contains workspace switcher, named navigation, nested disclosure document links and connection status. Topbar contains breadcrumbs, command launcher, actual presence and user menu. Use existing authorized data. Focus mode hides navigation chrome and retains an exit control. Cmd/Ctrl+K opens search/navigate/create/theme commands; ? opens help outside editable fields.

Below 768px navigation leaves the document flow for a modal drawer. Content fills the viewport from 360px with wrapping actions, no page-level horizontal scroll. Include skip-to-main, aria-current and a main landmark. Document title inputs need min-width:0, available width and separately wrapping metadata. The known zero-width title at 390px remains open until structural work and seed/fixture browser validation.

## Remaining acceptance work

Integrate controls into the shell; migrate product-page fixed colors; fix mobile titles; run browser axe on all shell states; capture 1440/390 dark/light states; critique hierarchy, spacing, contrast, alignment, density, spec consistency and mobile; fix/repeat once; add shell Playwright visual tests. English/Hindi/Tamil i18n is last. No Phase 3 work.
