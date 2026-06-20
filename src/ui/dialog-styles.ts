// Assembles the design-system CSS for injection into a content-script shadow
// root on an arbitrary third-party page. Two transforms make the vendored CSS
// work there: tokens are rescoped from :root to :host (the page's :root carries
// no CTM tokens), and the General Sans @font-face URLs are rewritten to
// extension-absolute URLs (web_accessible_resources). Pure string work so it's
// unit-testable without the build's ?raw imports.

export const GENERAL_SANS_WEIGHTS = [400, 500, 600, 700] as const;
export type FontWeight = (typeof GENERAL_SANS_WEIGHTS)[number];

export function buildFontFaceCss(
  urlForWeight: (weight: FontWeight) => string,
): string {
  return GENERAL_SANS_WEIGHTS.map(
    (weight) => `@font-face {
  font-family: "General Sans";
  src: url("${urlForWeight(weight)}") format("woff2");
  font-weight: ${weight};
  font-style: normal;
  font-display: swap;
}`,
  ).join("\n");
}

// The design system scopes every token to :root. Inside a shadow root those
// don't resolve unless the host page defines them, so rescope to :host.
export function rootToHost(css: string): string {
  return css.replace(/:root\b/g, ":host");
}

export function assembleDialogCss(params: {
  tokensCss: string;
  componentsCss: string;
  fontFaceCss: string;
}): string {
  // Font faces first so they're declared before any rule references the family;
  // a base rule sets the family/color on the backdrop so descendants inherit it
  // rather than the host page's inherited font/color.
  const base = `.modal-backdrop {
  font-family: var(--font-sans);
  color: var(--color-text);
  line-height: var(--leading-normal);
}`;
  return [
    params.fontFaceCss,
    rootToHost(params.tokensCss),
    params.componentsCss,
    base,
  ].join("\n\n");
}
