import { describe, expect, it } from "vitest";
import { describeOutcome, resolveInitialMapId } from "./dialog-view";

const maps = [
  { id: 1, name: "Trails" },
  { id: 7, name: "Rides" },
];

describe("resolveInitialMapId", () => {
  it("returns null when the user has no maps", () => {
    expect(resolveInitialMapId([], 5)).toBeNull();
  });

  it("pre-selects the last-used map when it still exists", () => {
    expect(resolveInitialMapId(maps, 7)).toBe(7);
  });

  it("falls back to the first map when there's no last-used", () => {
    expect(resolveInitialMapId(maps, null)).toBe(1);
  });

  it("falls back to the first map when the last-used map was deleted", () => {
    expect(resolveInitialMapId(maps, 999)).toBe(1);
  });
});

describe("describeOutcome", () => {
  it("treats a successful upload as success", () => {
    expect(describeOutcome({ status: "ok" })).toEqual({
      tone: "success",
      message: "Sent to Color The Map.",
    });
  });

  it("treats a duplicate as a benign success", () => {
    expect(describeOutcome({ status: "duplicate" }).tone).toBe("success");
  });

  it("surfaces CTM's error detail verbatim", () => {
    expect(
      describeOutcome({ status: "error", detail: "Map not found" }),
    ).toEqual({ tone: "error", message: "Map not found" });
  });

  it("falls back to a generic message when error has no detail", () => {
    expect(describeOutcome({ status: "error" }).message).toBe("Upload failed.");
  });
});
