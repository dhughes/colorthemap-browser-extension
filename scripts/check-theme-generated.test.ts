import { describe, expect, it } from "vitest";
import { validateThemeCss } from "./check-theme-generated.ts";

const validCss = [
  "/* GENERATED FILE — do not edit. */",
  ":root,",
  ":host {",
  "  --color-text: #1a1a1a;",
  "}",
  "@theme inline {",
  "  --color-text: var(--color-text);",
  "}",
  "",
].join("\n");

describe("validateThemeCss", () => {
  it("passes a well-formed generated theme", () => {
    expect(validateThemeCss(validCss)).toEqual([]);
  });

  it("flags empty content", () => {
    expect(validateThemeCss("")).not.toEqual([]);
  });

  it("flags a missing generated banner", () => {
    const problems = validateThemeCss(validCss.replace("GENERATED FILE", "x"));
    expect(problems.join(" ")).toMatch(/banner/i);
  });

  it("flags missing :host scoping", () => {
    const problems = validateThemeCss(validCss.replace(":host", ".host"));
    expect(problems.join(" ")).toMatch(/:host/);
  });

  it("flags a missing @theme mapping", () => {
    const problems = validateThemeCss(validCss.replace(/@theme/g, "@junk"));
    expect(problems.join(" ")).toMatch(/@theme/);
  });

  it("flags unbalanced braces", () => {
    const problems = validateThemeCss(
      validCss.replace("}\n@theme", "\n@theme"),
    );
    expect(problems.join(" ")).toMatch(/brace/i);
  });

  it("ignores braces inside comments when balancing", () => {
    expect(validateThemeCss(validCss + "/* { */\n")).toEqual([]);
  });
});
