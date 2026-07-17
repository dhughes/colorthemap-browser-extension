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

// Tailwind theme keys that can't be derived mechanically from a var's own
// name: namespace re-homes (spacing-*, container-*) and the --shell- prefix
// drop CTM itself performs in its @theme block. Ladder colors and shadows are
// mapped mechanically in emit.ts and don't appear here.
export const THEME_KEY_MAP: ReadonlyArray<
  readonly [themeKey: string, sourceVar: string]
> = [
  ["--color-shell-scrim", "--shell-color-scrim"],
  ["--radius-control", "--radius-control"],
  ["--radius-card", "--radius-card"],
  ["--radius-surface", "--radius-surface"],
  ["--radius-pill", "--radius-pill"],
  ["--font-system", "--font-system"],
  ["--text-micro", "--text-micro"],
  ["--text-secondary", "--text-secondary"],
  ["--text-body", "--text-body"],
  ["--text-input", "--text-input"],
  ["--text-title", "--text-title"],
  ["--tracking-micro", "--tracking-micro"],
  ["--spacing-touch", "--touch-target"],
  ["--container-dialog-card", "--dialog-w-card"],
  ["--container-dialog-panel", "--dialog-w-panel"],
  ["--spacing-dialog-max", "--dialog-max-h"],
];
