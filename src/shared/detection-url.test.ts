import { describe, expect, it } from "vitest";
import {
  filenameFromContentDisposition,
  filenameFromUrl,
  formatForFilename,
  formatForUrl,
  isAmbiguousDownloadUrl,
  linkDownloadFormat,
  safeFilename,
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

describe("linkDownloadFormat", () => {
  it("falls back to the path extension like formatForUrl", () => {
    expect(linkDownloadFormat("https://example.com/route.gpx")).toBe("gpx");
    expect(linkDownloadFormat("https://example.com/tour.kmz?dl=1")).toBe("kmz");
    expect(linkDownloadFormat("https://example.com/photo.jpg")).toBeNull();
  });

  it("reads the format from a query param (MapMyFitness routes)", () => {
    expect(
      linkDownloadFormat(
        "https://www.mapmyfitness.com/v7.2/route/1156937188/?format=gpx&field_set=detailed",
      ),
    ).toBe("gpx");
    expect(
      linkDownloadFormat(
        "https://www.mapmyfitness.com/v7.2/route/1156937188/?format=kml&field_set=detailed",
      ),
    ).toBe("kml");
  });

  it("reads the format from a bare trailing path segment on an export path (MMF workout)", () => {
    expect(
      linkDownloadFormat(
        "https://www.mapmyfitness.com/workout/export/1597560212/tcx",
      ),
    ).toBe("tcx");
  });

  it("reads the format from a mid-path segment on an export path (Polar Flow)", () => {
    expect(
      linkDownloadFormat(
        "https://flow.polar.com/api/export/training/tcx/8357513887?compress=false",
      ),
    ).toBe("tcx");
    expect(
      linkDownloadFormat(
        "https://flow.polar.com/api/export/training/fit/8357513887",
      ),
    ).toBe("fit");
    expect(
      linkDownloadFormat(
        "https://flow.polar.com/api/export/training/gpx/8357513887?compress=false",
      ),
    ).toBe("gpx");
  });

  it("still resolves the Polar zip variant by format (content sniff filters it later)", () => {
    // The zip link shares the TCX path; URL-level it looks like TCX. The toast's
    // same-origin matchesFormat check rejects the zip bytes, so no toast shows.
    expect(
      linkDownloadFormat(
        "https://flow.polar.com/api/export/training/tcx/8357513887?compress=true",
      ),
    ).toBe("tcx");
  });

  it("does not match non-GPS export segments like CSV", () => {
    expect(
      linkDownloadFormat(
        "https://flow.polar.com/api/export/training/csv/8357513887?compress=false",
      ),
    ).toBeNull();
  });

  it("does not match format-named segments on non-download paths", () => {
    expect(linkDownloadFormat("https://example.com/gpx/help")).toBeNull();
    expect(
      linkDownloadFormat("https://example.com/blog/tcx-explained"),
    ).toBeNull();
  });

  it("returns null for unparseable input", () => {
    expect(linkDownloadFormat("not a url")).toBeNull();
    expect(linkDownloadFormat("")).toBeNull();
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

describe("filenameFromUrl", () => {
  it("uses the URL's last path segment when it has a filename", () => {
    expect(filenameFromUrl("https://example.com/a/route.gpx", "gpx")).toBe(
      "route.gpx",
    );
  });

  it("URL-decodes the segment", () => {
    expect(filenameFromUrl("https://example.com/My%20Ride.tcx", "tcx")).toBe(
      "My Ride.tcx",
    );
  });

  it("ignores the query string", () => {
    expect(
      filenameFromUrl("https://example.com/route.gpx?token=abc", "gpx"),
    ).toBe("route.gpx");
  });

  it("synthesizes download.<format> when the path has no filename", () => {
    expect(filenameFromUrl("https://example.com/export", "kml")).toBe(
      "download.kml",
    );
    expect(filenameFromUrl("https://example.com/", "fit")).toBe("download.fit");
  });

  it("synthesizes a name for unparseable input", () => {
    expect(filenameFromUrl("not a url", "gpx")).toBe("download.gpx");
  });
});

describe("safeFilename", () => {
  it("keeps a normal filename intact", () => {
    expect(safeFilename("My Ride.gpx")).toBe("My Ride.gpx");
  });

  it("strips path separators down to the basename", () => {
    expect(safeFilename("../../etc/passwd.gpx")).toBe("passwd.gpx");
    expect(safeFilename("a\\b\\c.kml")).toBe("c.kml");
  });

  it("neutralizes markup/shell characters", () => {
    expect(safeFilename("<img src=x>.gpx")).toBe("_img src=x_.gpx");
  });

  it("falls back to 'download' when nothing usable remains", () => {
    expect(safeFilename("/")).toBe("download");
    expect(safeFilename("")).toBe("download");
  });

  it("caps absurdly long names", () => {
    expect(safeFilename("a".repeat(500) + ".gpx").length).toBeLessThanOrEqual(
      200,
    );
  });
});
