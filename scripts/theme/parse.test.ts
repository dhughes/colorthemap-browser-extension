import { describe, expect, it } from "vitest";
import {
  collectVarNames,
  extractFirstTopLevelRootBlock,
  parseDeclarations,
  rescopeRootSelectors,
  stripComments,
  stripGeneratedBanner,
} from "./parse.ts";

describe("stripComments", () => {
  it("removes block comments, including ones containing braces", () => {
    expect(stripComments("a /* { nope } */ b")).toBe("a  b");
  });

  it("preserves comment-like sequences inside quoted strings", () => {
    const css = 'content: "/* not a comment */";';
    expect(stripComments(css)).toBe(css);
  });

  it("drops an unterminated comment through end of input", () => {
    expect(stripComments("a /* dangling")).toBe("a ");
  });
});

describe("stripGeneratedBanner", () => {
  it("removes a leading GENERATED FILE banner and following blank lines", () => {
    const css = "/* GENERATED FILE — do not edit. */\n\n:root {\n}\n";
    expect(stripGeneratedBanner(css)).toBe(":root {\n}\n");
  });

  it("leaves a leading comment that is not a banner", () => {
    const css = "/* Just prose. */\n:root {\n}\n";
    expect(stripGeneratedBanner(css)).toBe(css);
  });

  it("no-ops when there is no leading comment", () => {
    const css = ":root {\n}\n";
    expect(stripGeneratedBanner(css)).toBe(css);
  });
});

describe("rescopeRootSelectors", () => {
  it("adds :host to a line-anchored :root selector list", () => {
    expect(rescopeRootSelectors(":root,\n.a {\n}\n")).toBe(
      ":root,\n:host,\n.a {\n}\n",
    );
  });

  it("adds :host to a bare :root block", () => {
    expect(rescopeRootSelectors(":root {\n}\n")).toBe(":root,\n:host {\n}\n");
  });

  it("leaves :root mentions inside comment prose untouched", () => {
    const css = "/* mapped to :root (the page default) */\n.a {\n}\n";
    expect(rescopeRootSelectors(css)).toBe(css);
  });

  it("leaves dark-surface selector lists untouched", () => {
    const css = ".surface-dark-solid,\n.surface-dark-glass {\n}\n";
    expect(rescopeRootSelectors(css)).toBe(css);
  });
});

describe("extractFirstTopLevelRootBlock", () => {
  it("returns the body of the first top-level :root block", () => {
    const body = extractFirstTopLevelRootBlock(
      "/* intro { */\n:root {\n  --a: 1;\n}\n",
    );
    expect(body).toContain("--a: 1;");
  });

  it("ignores a :root nested inside @media", () => {
    const css = "@media (width >= 10rem) {\n  :root {\n    --a: 1;\n  }\n}\n";
    expect(extractFirstTopLevelRootBlock(css)).toBeNull();
  });

  it("skips the @media block and finds a later top-level :root", () => {
    const css =
      "@media (width >= 10rem) {\n  :root {\n    --a: 1;\n  }\n}\n:root {\n  --b: 2;\n}\n";
    const body = extractFirstTopLevelRootBlock(css);
    expect(body).toContain("--b: 2;");
    expect(body).not.toContain("--a: 1;");
  });

  it("returns null when no :root block exists", () => {
    expect(extractFirstTopLevelRootBlock(".a {\n}\n")).toBeNull();
  });
});

describe("parseDeclarations", () => {
  it("parses simple custom-property declarations in order", () => {
    expect(parseDeclarations("--a: 1px;\n--b: red;")).toEqual([
      { name: "--a", value: "1px" },
      { name: "--b", value: "red" },
    ]);
  });

  it("normalizes multi-line values to single-spaced text", () => {
    const decls = parseDeclarations(
      '--font-system:\n    -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,\n    sans-serif;',
    );
    expect(decls).toEqual([
      {
        name: "--font-system",
        value:
          '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      },
    ]);
  });

  it("keeps nested-paren values intact", () => {
    const decls = parseDeclarations(
      "--inset: calc(var(--x) + env(safe-area-inset-top, 0px));\n--ease: cubic-bezier(0.32, 0.72, 0.28, 1);",
    );
    expect(decls).toEqual([
      {
        name: "--inset",
        value: "calc(var(--x) + env(safe-area-inset-top, 0px))",
      },
      { name: "--ease", value: "cubic-bezier(0.32, 0.72, 0.28, 1)" },
    ]);
  });

  it("ignores comments and non-custom-property declarations", () => {
    const decls = parseDeclarations(
      "/* prose; with a semicolon */\ncolor: red;\n--a: 1;",
    );
    expect(decls).toEqual([{ name: "--a", value: "1" }]);
  });
});

describe("collectVarNames", () => {
  const css =
    ":root { --color-a: #fff; --shadow-x: 0 0 1px var(--color-a); }\n.dark { --color-a: #000; --color-b: #111; }";

  it("collects declared names with the prefix, first-seen order, deduped", () => {
    expect(collectVarNames(css, "--color-")).toEqual([
      "--color-a",
      "--color-b",
    ]);
  });

  it("does not treat var() references as declarations", () => {
    expect(collectVarNames(css, "--color-")).not.toContain("--color-a)");
    expect(collectVarNames("a { b: var(--color-z); }", "--color-")).toEqual([]);
  });

  it("respects the prefix boundary", () => {
    expect(collectVarNames(css, "--shadow-")).toEqual(["--shadow-x"]);
  });

  it("ignores declarations inside comments", () => {
    expect(collectVarNames("/* --color-fake: #f00; */", "--color-")).toEqual(
      [],
    );
  });
});
