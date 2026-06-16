import { describe, expect, it } from "vitest";
import { createRecentDetections, dedupeKey } from "./dedupe";
import type { DetectionPayload } from "./messages";

const base: DetectionPayload = {
  detector: "C",
  source: "link",
  format: "gpx",
  url: "https://example.com/route.gpx",
};

describe("dedupeKey", () => {
  it("keys on format and URL together", () => {
    expect(
      dedupeKey({ format: "gpx", url: "https://example.com/route.gpx" }),
    ).toBe("gpx|https://example.com/route.gpx");
  });

  it("normalizes away the hash fragment so identical downloads collapse", () => {
    expect(
      dedupeKey({ format: "gpx", url: "https://example.com/r.gpx#a" }),
    ).toBe(dedupeKey({ format: "gpx", url: "https://example.com/r.gpx" }));
  });

  it("keeps distinct URLs and formats distinct", () => {
    expect(
      dedupeKey({ format: "gpx", url: "https://example.com/a.gpx" }),
    ).not.toBe(dedupeKey({ format: "gpx", url: "https://example.com/b.gpx" }));
    expect(
      dedupeKey({ format: "gpx", url: "https://example.com/a.gpx" }),
    ).not.toBe(dedupeKey({ format: "kml", url: "https://example.com/a.gpx" }));
  });
});

describe("createRecentDetections", () => {
  it("treats the first sighting as fresh and the next as a duplicate", () => {
    const recent = createRecentDetections(3000);
    expect(recent.isDuplicate(base, 1000)).toBe(false);
    expect(recent.isDuplicate(base, 1500)).toBe(true);
  });

  it("collapses the same download arriving from different detectors", () => {
    const recent = createRecentDetections(3000);
    const fromBadge: DetectionPayload = {
      ...base,
      detector: "C",
      source: "link",
    };
    const fromFetch: DetectionPayload = {
      ...base,
      detector: "A",
      source: "fetch",
    };
    expect(recent.isDuplicate(fromBadge, 1000)).toBe(false);
    expect(recent.isDuplicate(fromFetch, 1100)).toBe(true);
  });

  it("does not collapse distinct downloads", () => {
    const recent = createRecentDetections(3000);
    expect(recent.isDuplicate(base, 1000)).toBe(false);
    expect(
      recent.isDuplicate(
        { ...base, url: "https://example.com/other.gpx" },
        1100,
      ),
    ).toBe(false);
  });

  it("allows the same download again once the window has elapsed", () => {
    const recent = createRecentDetections(3000);
    expect(recent.isDuplicate(base, 1000)).toBe(false);
    expect(recent.isDuplicate(base, 5000)).toBe(false);
  });

  it("keeps a burst collapsed by refreshing the window on each sighting", () => {
    const recent = createRecentDetections(3000);
    expect(recent.isDuplicate(base, 1000)).toBe(false);
    expect(recent.isDuplicate(base, 3500)).toBe(true);
    expect(recent.isDuplicate(base, 6000)).toBe(true);
  });
});
