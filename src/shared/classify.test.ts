import { describe, expect, it } from "vitest";
import { classifyByMetadata, isRenderedNonGpsContentType } from "./classify";

describe("classifyByMetadata", () => {
  it("uses the URL path extension as the first signal", () => {
    expect(classifyByMetadata({ url: "https://example.com/route.gpx" })).toBe(
      "gpx",
    );
  });

  it("falls back to the filename extension when the URL has none", () => {
    expect(
      classifyByMetadata({
        url: "https://example.com/activities/123/export",
        filename: "My Ride.fit",
      }),
    ).toBe("fit");
  });

  it("uses the MIME type only as a last resort", () => {
    expect(
      classifyByMetadata({
        url: "https://example.com/download",
        contentType: "application/gpx+xml",
      }),
    ).toBe("gpx");
  });

  it("prefers the extension over a conflicting MIME type", () => {
    expect(
      classifyByMetadata({
        url: "https://example.com/route.gpx",
        contentType: "application/vnd.google-earth.kml+xml",
      }),
    ).toBe("gpx");
  });

  it("returns null when no metadata signal identifies a format", () => {
    expect(
      classifyByMetadata({
        url: "https://example.com/export",
        contentType: "application/octet-stream",
      }),
    ).toBeNull();
    expect(classifyByMetadata({})).toBeNull();
  });
});

describe("isRenderedNonGpsContentType", () => {
  it("flags rendered web-resource types that a .gpx URL must not be trusted over", () => {
    for (const type of [
      "text/html",
      "text/html; charset=utf-8",
      "application/json",
      "application/vnd.github+json",
      "text/css",
      "application/javascript",
      "image/png",
      "font/woff2",
    ]) {
      expect(isRenderedNonGpsContentType(type)).toBe(true);
    }
  });

  it("does not flag types a real GPS file can legitimately arrive as", () => {
    for (const type of [
      "application/gpx+xml",
      "application/xml",
      "text/xml",
      "text/plain",
      "application/octet-stream",
      "application/vnd.google-earth.kmz",
      "",
    ]) {
      expect(isRenderedNonGpsContentType(type)).toBe(false);
    }
  });
});
