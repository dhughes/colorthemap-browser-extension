// The extension's reusable look vocabulary — Tailwind utility class strings
// on the generated CTM v2 tokens, ported from CTM's buttonStyles.ts /
// inputStyles.ts so both apps' controls are cut from the same cloth. Vanilla
// static composition: no runtime class-merge machinery needed.

export type ButtonTone = "primary" | "neutral" | "destructive";
export type ButtonEmphasis = "solid" | "secondary";
export type ButtonSize = "sm" | "md" | "lg";

// Layout, pill shape, typography, disabled treatment, and the ≥44pt hit
// target (a sm pill's visual box sits under 44 — hit-target pads the
// interactive area, not the layout).
const BUTTON_BASE =
  "hit-target inline-flex items-center justify-center gap-2 rounded-pill font-system font-semibold whitespace-nowrap cursor-pointer transition disabled:cursor-not-allowed disabled:opacity-40";

// The six tone × emphasis cells, all on the generated ladder: solid = the
// tone's 500 with hover/press at 700; secondary = tone-colored text on the
// tone's 100 tint, pressed to the 300. `not-disabled:` (not `enabled:`) so
// the states also apply to anchors wearing these styles.
const BUTTON_CELL: Record<ButtonTone, Record<ButtonEmphasis, string>> = {
  primary: {
    solid:
      "bg-magenta-500 text-white not-disabled:hover:bg-magenta-700 not-disabled:active:bg-magenta-700",
    secondary:
      "bg-magenta-100 text-magenta-900 not-disabled:hover:bg-magenta-300 not-disabled:active:bg-magenta-300",
  },
  neutral: {
    solid:
      "bg-gray-500 text-white not-disabled:hover:bg-gray-700 not-disabled:active:bg-gray-700",
    secondary:
      "bg-gray-100 text-ink-900 not-disabled:hover:bg-gray-300 not-disabled:active:bg-gray-300",
  },
  destructive: {
    solid:
      "bg-red-500 text-white not-disabled:hover:bg-red-700 not-disabled:active:bg-red-700",
    secondary:
      "bg-red-100 text-red-900 not-disabled:hover:bg-red-300 not-disabled:active:bg-red-300",
  },
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  sm: "px-3 py-2 text-secondary",
  md: "px-4 py-3 text-body",
  lg: "px-4 py-3 text-title",
};

export interface ButtonClassOptions {
  tone?: ButtonTone;
  emphasis?: ButtonEmphasis;
  size?: ButtonSize;
  width?: "auto" | "full";
}

export function buttonClass(options: ButtonClassOptions = {}): string {
  const {
    tone = "neutral",
    emphasis = "solid",
    size = "md",
    width = "auto",
  } = options;
  const classes = [BUTTON_BASE, BUTTON_CELL[tone][emphasis], BUTTON_SIZE[size]];
  if (width === "full") {
    classes.push("w-full");
  }
  return classes.join(" ");
}

// The header ✕ (CTM's CloseButton "header" variant): round hit area, faint ink
// glyph, fill-flash hover, hit-target-padded to the 44pt floor.
export const closeButtonClass =
  "hit-target flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-text-muted transition hover:bg-fill hover:text-text";

export type AlertTone = "success" | "error" | "warning" | "info";

// v2 has no "subtle" alert tints; the ladder's 100 rung is the tint, the 300
// the border, the 900 the text — same recipe CTM's secondary buttons use.
const ALERT_TONE: Record<AlertTone, string> = {
  success: "border-forest-300 bg-forest-100 text-forest-900",
  error: "border-red-300 bg-red-100 text-red-900",
  warning: "border-brown-300 bg-brown-100 text-brown-900",
  info: "border-blue-300 bg-blue-100 text-blue-900",
};

export function alertClass(tone: AlertTone): string {
  return `rounded-control border px-4 py-3 text-body ${ALERT_TONE[tone]}`;
}

// The shared text-input look ported from CTM's inputStyles.ts: border role
// outline, control radius, white face, 16px type, and the field family's own
// focus ring (2px at −1px offset, overriding the global 1px halo). No <input>
// consumer yet — staged for #16's sign-in affordance; selectClass derives
// from it today.
export const inputClass =
  "w-full rounded-control border border-border bg-light-gray-100 p-3 text-input text-text transition-colors placeholder:text-text-faint hover:border-border-strong focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-magenta-500 disabled:cursor-not-allowed disabled:opacity-40";

export const selectClass = `${inputClass} cursor-pointer`;

export const labelClass = "text-secondary font-semibold text-text";

// A compact uppercase pill for a file's detected format (GPX / FIT / …): the
// micro type on a fill-tinted rounded chip. Polarity-aware via the ladder, so
// it reads correctly on either surface.
export const formatBadgeClass =
  "inline-flex items-center rounded-pill bg-fill px-2 py-0.5 text-micro font-semibold uppercase tracking-micro text-text-muted";

export const spinnerClass =
  "size-4 shrink-0 animate-spin rounded-full border-2 border-border border-t-text";

// An elevated card face; the polarity class scopes the whole token ladder for
// everything inside it. Light is CTM's card/popover/menu face (#fff); dark ink
// is reserved for the selection bar. The #21 toast is a light card.
export function surfaceCardClass(polarity: "light" | "dark"): string {
  const surface =
    polarity === "light" ? "surface-light-solid" : "surface-dark-solid";
  return `${surface} rounded-card shadow-raised`;
}
