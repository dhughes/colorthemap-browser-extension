# Styles

Tailwind v4 on design tokens generated from Color The Map's canonical v2
sources. Nothing here is hand-copied from CTM.

- `theme.generated.css` — GENERATED, committed. The CTM v2 color ladder, role
  aliases, surface classes, curated non-color tokens, and the Tailwind
  `@theme` mapping, stamped with the CTM commit it came from. Regenerated
  automatically by `npm run dev` / `npm run build` when the sibling
  `color-the-map` checkout is present (see `scripts/generate-theme.ts`);
  never edited by hand, never regenerated in CI.
- `foundation.css` — hand-written substrate: Tailwind layers/preflight, the
  generated theme, the base reset + focus ring, and the small ported
  utilities (`hit-target`, `backdrop-scrim`).
- `shadow.css` — `foundation.css` plus the `:host` text baseline; imported
  with `?inline` by content-script surfaces and injected into their shadow
  roots (the compiled text ships inside the content bundle).

Surfaces are light by default (CTM's card/popover/menu face); a dark surface
opts in with `surface-dark-solid` (CTM reserves ink for the selection bar).
Reusable component looks live in `src/ui/recipes.ts`.
