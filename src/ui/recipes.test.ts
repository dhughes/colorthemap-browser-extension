import { describe, expect, it } from "vitest";
import {
  alertClass,
  buttonClass,
  selectClass,
  surfaceCardClass,
} from "./recipes";

describe("buttonClass", () => {
  it("defaults to a neutral solid md pill with the shared base", () => {
    const cls = buttonClass();
    expect(cls).toContain("hit-target");
    expect(cls).toContain("rounded-pill");
    expect(cls).toContain("bg-gray-500");
    expect(cls).toContain("px-4 py-3 text-body");
    expect(cls).not.toContain("w-full");
  });

  it("composes tone, emphasis, and size", () => {
    const cls = buttonClass({ tone: "primary", size: "lg" });
    expect(cls).toContain("bg-magenta-500");
    expect(cls).toContain("not-disabled:hover:bg-magenta-700");
    expect(cls).toContain("text-title");
  });

  it("renders destructive secondary as red text on the red tint", () => {
    const cls = buttonClass({ tone: "destructive", emphasis: "secondary" });
    expect(cls).toContain("bg-red-100");
    expect(cls).toContain("text-red-900");
  });

  it("spans the container when width is full", () => {
    expect(buttonClass({ width: "full" })).toContain("w-full");
  });
});

describe("alertClass", () => {
  it("keeps the shared shape across tones", () => {
    for (const tone of ["success", "error", "warning", "info"] as const) {
      expect(alertClass(tone)).toContain("rounded-control border");
    }
  });

  it("tints by tone on the ladder rungs", () => {
    expect(alertClass("success")).toContain("bg-forest-100");
    expect(alertClass("error")).toContain("bg-red-100");
  });
});

describe("selectClass", () => {
  it("extends the input look with a pointer cursor", () => {
    expect(selectClass).toContain("rounded-control");
    expect(selectClass).toContain("cursor-pointer");
  });
});

describe("surfaceCardClass", () => {
  it("pairs the polarity surface with card radius and elevation", () => {
    expect(surfaceCardClass("light")).toBe(
      "surface-light-solid rounded-card shadow-raised",
    );
    expect(surfaceCardClass("dark")).toBe(
      "surface-dark-solid rounded-card shadow-raised",
    );
  });
});
