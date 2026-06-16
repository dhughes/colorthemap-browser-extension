import { describe, expect, it } from "vitest";
import { classifyByMetadata } from "./classify";

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
