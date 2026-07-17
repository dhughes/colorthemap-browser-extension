import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assembleThemeCss,
  buildBanner,
  buildLadderSection,
  buildThemeSection,
  buildV2TokensSection,
} from "./emit.ts";

const ladderCss = readFileSync(
  fileURLToPath(
    new URL(
      "../../test-fixtures/theme/tokens-ladder.generated.css",
      import.meta.url,
    ),
  ),
  "utf8",
);
const tokensV2Css = readFileSync(
  fileURLToPath(
    new URL("../../test-fixtures/theme/tokens-v2.css", import.meta.url),
  ),
  "utf8",
);

describe("buildBanner", () => {
  it("stamps the CTM commit SHA", () => {
    const banner = buildBanner({ sha: "a724c5cc", dirty: false });
    expect(banner).toContain("GENERATED FILE");
    expect(banner).toContain("color-the-map @ a724c5cc");
    expect(banner).not.toContain("uncommitted");
  });

  it("adds a warning line when the CTM checkout was dirty", () => {
    expect(buildBanner({ sha: "a724c5cc", dirty: true })).toContain(
      "uncommitted changes",
    );
  });
});

describe("buildLadderSection", () => {
  const section = buildLadderSection(ladderCss);

  it("rescopes the light block and the materials block to include :host", () => {
    expect(section).toContain(":root,\n:host,\n.surface-light-solid");
    expect(section).toContain(":root,\n:host {");
  });

  it("leaves the dark-surface block class-scoped", () => {
    expect(section).toContain(".surface-dark-solid,\n.surface-dark-glass {");
  });

  it("drops CTM's own generated banner", () => {
    expect(section).not.toContain("GENERATED FILE");
    expect(section).not.toContain("generate:ladder");
  });

  it("keeps ladder values and role aliases verbatim", () => {
    expect(section).toContain("--color-magenta-500: #ff00ff;");
    expect(section).toContain("--color-text: var(--color-ink-500);");
  });
});

describe("buildV2TokensSection", () => {
  const section = buildV2TokensSection(tokensV2Css);

  it("emits a :root, :host block of allowlisted tokens", () => {
    expect(section).toContain(":root,\n:host {");
    expect(section).toContain("--radius-card: 0.875rem;");
    expect(section).toContain("--touch-target: 44px;");
    expect(section).toContain("--dialog-w-card: 20rem;");
    expect(section).toContain(
      '--font-system: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;',
    );
  });

  it("excludes tokens outside the allowlist", () => {
    expect(section).not.toContain("--font-display");
    expect(section).not.toContain("--shell-inset");
    expect(section).not.toContain("--size-fab");
    expect(section).not.toContain("--transition-chrome");
    expect(section).not.toContain("--dialog-safe-top");
  });

  it("fails loudly, naming the token, when an allowlisted token is missing", () => {
    const doctored = tokensV2Css.replace("--radius-card", "--radius-kard");
    expect(() => buildV2TokensSection(doctored)).toThrow(/--radius-card/);
  });
});

describe("buildThemeSection", () => {
  const section = buildThemeSection({ ladderCss, tokensV2Css });

  it("wipes the stock palette and re-adds white/black", () => {
    expect(section).toContain("--color-*: initial;");
    expect(section).toContain("--color-white: #ffffff;");
    expect(section).toContain("--color-black: #000000;");
  });

  it("maps every ladder color and role as a pass-through theme key", () => {
    expect(section).toContain("--color-magenta-500: var(--color-magenta-500);");
    expect(section).toContain("--color-text: var(--color-text);");
    expect(section).toContain("--color-gps-accent: var(--color-gps-accent);");
  });

  it("maps ladder shadows but never the FAB ring vars", () => {
    expect(section).toContain("--shadow-raised: var(--shadow-raised);");
    expect(section).toContain("--shadow-float: var(--shadow-float);");
    expect(section).not.toContain("--fab-ring");
  });

  it("maps the scrim rename and the policy theme keys", () => {
    expect(section).toContain("--color-shell-scrim: var(--shell-color-scrim);");
    expect(section).toContain("--spacing-touch: var(--touch-target);");
    expect(section).toContain("--container-dialog-card: var(--dialog-w-card);");
    expect(section).toContain(
      "--container-dialog-panel: var(--dialog-w-panel);",
    );
    expect(section).toContain("--spacing-dialog-max: var(--dialog-max-h);");
    expect(section).toContain("--radius-card: var(--radius-card);");
    expect(section).toContain("--text-title: var(--text-title);");
    expect(section).toContain("--font-system: var(--font-system);");
  });

  it("fails loudly when a mapped source var vanishes from the sources", () => {
    const doctored = ladderCss.replace("--shell-color-scrim", "--shell-scrim");
    expect(() =>
      buildThemeSection({ ladderCss: doctored, tokensV2Css }),
    ).toThrow(/--shell-color-scrim/);
  });
});

describe("assembleThemeCss", () => {
  const css = assembleThemeCss({
    ladderCss,
    tokensV2Css,
    sha: "a724c5cc",
    dirty: false,
  });

  it("starts with the banner", () => {
    expect(css.startsWith("/* GENERATED FILE")).toBe(true);
  });

  it("orders tokens before the theme mapping", () => {
    const ladderIdx = css.indexOf("--color-magenta-500: #ff00ff;");
    const themeIdx = css.indexOf("@theme");
    expect(ladderIdx).toBeGreaterThan(0);
    expect(themeIdx).toBeGreaterThan(ladderIdx);
  });

  it("emits balanced braces", () => {
    const open = css.split("{").length;
    const close = css.split("}").length;
    expect(open).toBe(close);
  });
});
