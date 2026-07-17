// The extension's curated cut of CTM's v2 token vocabulary. The ladder file is
// copied wholesale (it's already CTM's own curated cut); tokens-v2.css is a
// grab-bag mixing reusable tokens with CTM-shell-only geometry (sheet detents,
// shell insets, FAB/avatar sizes), so it's filtered through this allowlist.
// The generator fails loudly when a listed name disappears upstream, so a CTM
// rename breaks the next regeneration instead of silently emitting nothing.
// Adopting a new CTM token later is a one-line addition here.
export const V2_TOKEN_ALLOWLIST: readonly string[] = [
  "--backdrop-scrim",
  "--radius-control",
  "--radius-card",
  "--radius-surface",
  "--radius-pill",
  "--font-system",
  "--text-micro",
  "--text-secondary",
  "--text-body",
  "--text-input",
  "--text-title",
  "--tracking-micro",
  "--touch-target",
  "--dialog-w-card",
  "--dialog-w-panel",
  "--dialog-max-h",
];

// Allowlisted tokens map into Tailwind's theme 1:1 by their own name (emit.ts
// derives those mechanically, like ladder colors and shadows). These two lists
// hold only the exceptions:
//
// Theme keys whose name differs from the source var — namespace re-homes
// (spacing-*, container-*) and the --shell- prefix drop CTM itself performs.
export const THEME_KEY_RENAMES: ReadonlyArray<
  readonly [themeKey: string, sourceVar: string]
> = [
  ["--color-shell-scrim", "--shell-color-scrim"],
  ["--spacing-touch", "--touch-target"],
  ["--container-dialog-card", "--dialog-w-card"],
  ["--container-dialog-panel", "--dialog-w-panel"],
  ["--spacing-dialog-max", "--dialog-max-h"],
];

// Allowlisted tokens that deliberately get no Tailwind theme key — consumed
// via var() only (--backdrop-scrim feeds the backdrop-scrim @utility).
export const THEME_UNMAPPED: ReadonlySet<string> = new Set([
  "--backdrop-scrim",
]);
