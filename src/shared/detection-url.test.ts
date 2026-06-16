import { describe, expect, it } from "vitest";
import {
  filenameFromContentDisposition,
  formatForFilename,
  formatForUrl,
  isAmbiguousDownloadUrl,
} from "./detection-url";

describe("formatForUrl", () => {
  it("matches each format by its path extension", () => {
    expect(formatForUrl("https://example.com/route.gpx")).toBe("gpx");
    expect(formatForUrl("https://example.com/ride.fit")).toBe("fit");
    expect(formatForUrl("https://example.com/run.tcx")).toBe("tcx");
    expect(formatForUrl("https://example.com/area.kml")).toBe("kml");
    expect(formatForUrl("https://example.com/tour.kmz")).toBe("kmz");
  });

  it("ignores query strings and hash fragments", () => {
    expect(formatForUrl("https://example.com/route.gpx?token=abc#frag")).toBe(
      "gpx",
    );
    expect(formatForUrl("https://example.com/tour.kmz?dl=1")).toBe("kmz");
  });

  it("is case-insensitive on the extension", () => {
    expect(formatForUrl("https://example.com/ROUTE.GPX")).toBe("gpx");
    expect(formatForUrl("https://example.com/Tour.Kmz")).toBe("kmz");
  });

  it("matches conservatively with endsWith, not includes", () => {
    expect(formatForUrl("https://example.com/gpx-help/page.html")).toBeNull();
    expect(formatForUrl("https://example.com/route.gpx.bak")).toBeNull();
    expect(formatForUrl("https://example.com/notgpx")).toBeNull();
  });

  it("does not treat a bare .zip as KMZ", () => {
    expect(formatForUrl("https://example.com/archive.zip")).toBeNull();
  });

  it("returns null for unknown extensions and unparseable input", () => {
    expect(formatForUrl("https://example.com/photo.jpg")).toBeNull();
    expect(formatForUrl("https://example.com/")).toBeNull();
    expect(formatForUrl("not a url")).toBeNull();
    expect(formatForUrl("")).toBeNull();
  });
});

describe("filenameFromContentDisposition", () => {
  it("reads a quoted filename", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="route.gpx"'),
    ).toBe("route.gpx");
  });

  it("reads an unquoted filename", () => {
    expect(
      filenameFromContentDisposition("attachment; filename=route.gpx"),
    ).toBe("route.gpx");
  });

  it("prefers the extended filename* over filename (RFC 6266) and decodes it", () => {
    expect(
      filenameFromContentDisposition(
        "attachment; filename=\"route.fit\"; filename*=UTF-8''My%20Ride.gpx",
      ),
    ).toBe("My Ride.gpx");
  });

  it("reads a quoted filename containing spaces", () => {
    expect(
      filenameFromContentDisposition('attachment; filename="My Ride.gpx"'),
    ).toBe("My Ride.gpx");
  });

  it("handles an extended filename* lacking the charset'lang' prefix", () => {
    expect(
      filenameFromContentDisposition("attachment; filename*=route.gpx"),
    ).toBe("route.gpx");
  });

  it("falls back to the raw value when percent-decoding fails", () => {
    expect(
      filenameFromContentDisposition("attachment; filename*=UTF-8''bad%ZZ.gpx"),
    ).toBe("bad%ZZ.gpx");
  });

  it("returns null when no filename is present", () => {
    expect(filenameFromContentDisposition("inline")).toBeNull();
    expect(filenameFromContentDisposition("")).toBeNull();
  });
});

describe("formatForFilename", () => {
  it("classifies a bare filename by its extension", () => {
    expect(formatForFilename("route.gpx")).toBe("gpx");
    expect(formatForFilename("tour.kmz")).toBe("kmz");
  });

  it("strips any directory path and is case-insensitive", () => {
    expect(formatForFilename("/Users/me/Downloads/My Ride.FIT")).toBe("fit");
    expect(formatForFilename("C:\\rides\\run.TCX")).toBe("tcx");
  });

  it("returns null for unknown extensions, dotfiles, and empty input", () => {
    expect(formatForFilename("archive.zip")).toBeNull();
    expect(formatForFilename("noext")).toBeNull();
    expect(formatForFilename(".gpx")).toBeNull();
    expect(formatForFilename("")).toBeNull();
  });
});

describe("isAmbiguousDownloadUrl", () => {
  it("flags extension-less URLs that carry download-ish query params", () => {
    expect(
      isAmbiguousDownloadUrl("https://example.com/export?format=gpx"),
    ).toBe(true);
    expect(
      isAmbiguousDownloadUrl(
        "https://example.com/tours/123/download?token=xyz",
      ),
    ).toBe(true);
  });

  it("does not flag URLs that already resolve to a known format", () => {
    expect(
      isAmbiguousDownloadUrl("https://example.com/route.gpx?token=xyz"),
    ).toBe(false);
  });

  it("does not flag plain URLs with no download hint", () => {
    expect(isAmbiguousDownloadUrl("https://example.com/about")).toBe(false);
    expect(isAmbiguousDownloadUrl("https://example.com/")).toBe(false);
  });

  it("returns false for unparseable input", () => {
    expect(isAmbiguousDownloadUrl("not a url")).toBe(false);
    expect(isAmbiguousDownloadUrl("")).toBe(false);
  });
});
