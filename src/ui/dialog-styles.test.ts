import { describe, expect, it } from "vitest";
import {
  assembleDialogCss,
  buildFontFaceCss,
  GENERAL_SANS_WEIGHTS,
  rootToHost,
} from "./dialog-styles";

describe("rootToHost", () => {
  it("rescopes :root token blocks to :host", () => {
    expect(rootToHost(":root { --color-primary: #ff00ff; }")).toBe(
      ":host { --color-primary: #ff00ff; }",
    );
  });

  it("leaves other selectors untouched", () => {
    const css = ".surface-light { --color-text: #1a1a1a; }";
    expect(rootToHost(css)).toBe(css);
  });

  it("rewrites every :root occurrence", () => {
    expect(rootToHost(":root, .x :root {}")).toBe(":host, .x :host {}");
  });
});

describe("buildFontFaceCss", () => {
  it("emits a face per General Sans weight with the resolved URL", () => {
    const css = buildFontFaceCss((w) => `chrome-extension://id/${w}.woff2`);
    for (const weight of GENERAL_SANS_WEIGHTS) {
      expect(css).toContain(`font-weight: ${weight};`);
      expect(css).toContain(`url("chrome-extension://id/${weight}.woff2")`);
    }
    expect(css).toContain('font-family: "General Sans";');
  });
});

describe("assembleDialogCss", () => {
  it("orders font faces first, then rescoped tokens, then components", () => {
    const css = assembleDialogCss({
      tokensCss: ":root { --color-primary: #ff00ff; }",
      componentsCss: ".btn-primary { background: var(--color-primary); }",
      fontFaceCss: "@font-face { font-family: 'General Sans'; }",
    });
    const fontIdx = css.indexOf("@font-face");
    const tokenIdx = css.indexOf(":host");
    const componentIdx = css.indexOf(".btn-primary");
    expect(fontIdx).toBeGreaterThanOrEqual(0);
    expect(fontIdx).toBeLessThan(tokenIdx);
    expect(tokenIdx).toBeLessThan(componentIdx);
    expect(css).not.toContain(":root");
  });
});
