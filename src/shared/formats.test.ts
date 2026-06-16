import { describe, expect, it } from "vitest";
import {
  GPS_FORMATS,
  GPS_FORMAT_IDS,
  formatForExtension,
  formatForMimeType,
  getFormatSpec,
  type GpsFormat,
} from "./formats";

describe("GPS_FORMATS table", () => {
  it("covers exactly the five supported formats", () => {
    expect(GPS_FORMAT_IDS).toEqual(["gpx", "fit", "tcx", "kml", "kmz"]);
    expect(GPS_FORMATS.map((spec) => spec.format)).toEqual(GPS_FORMAT_IDS);
  });

  it("gives every format at least one extension and one MIME type", () => {
    for (const spec of GPS_FORMATS) {
      expect(spec.extensions.length).toBeGreaterThan(0);
      expect(spec.mimeTypes.length).toBeGreaterThan(0);
    }
  });

  it("stores extensions lowercased with a leading dot", () => {
    for (const spec of GPS_FORMATS) {
      for (const ext of spec.extensions) {
        expect(ext).toBe(ext.toLowerCase());
        expect(ext.startsWith(".")).toBe(true);
      }
    }
  });

  it("treats the KMZ zip signature as corroborating-only, never sufficient", () => {
    expect(getFormatSpec("kmz").signature.kind).toBe("zip");
    expect(getFormatSpec("kmz").signatureSufficient).toBe(false);
  });

  it("treats every non-KMZ signature as sufficient to classify on its own", () => {
    for (const spec of GPS_FORMATS) {
      if (spec.format === "kmz") continue;
      expect(spec.signatureSufficient).toBe(true);
    }
  });

  it("describes the XML trio by root-element sniffing", () => {
    for (const format of ["gpx", "tcx", "kml"] as const) {
      const sig = getFormatSpec(format).signature;
      expect(sig.kind).toBe("xml-root");
      if (sig.kind === "xml-root") {
        expect(sig.rootTokens.length).toBeGreaterThan(0);
      }
    }
  });

  it("describes FIT by a byte signature at offset 8 (the '.FIT' marker)", () => {
    const sig = getFormatSpec("fit").signature;
    expect(sig.kind).toBe("bytes");
    if (sig.kind === "bytes") {
      expect(sig.offset).toBe(8);
      expect(sig.bytes).toEqual([0x2e, 0x46, 0x49, 0x54]);
    }
  });
});

describe("getFormatSpec", () => {
  it("returns the spec for a known format", () => {
    expect(getFormatSpec("gpx").format).toBe("gpx");
  });
});

describe("formatForExtension", () => {
  it("matches each canonical extension", () => {
    const cases: Array<[string, GpsFormat]> = [
      [".gpx", "gpx"],
      [".fit", "fit"],
      [".tcx", "tcx"],
      [".kml", "kml"],
      [".kmz", "kmz"],
    ];
    for (const [ext, format] of cases) {
      expect(formatForExtension(ext)).toBe(format);
    }
  });

  it("is case-insensitive and tolerates a missing leading dot", () => {
    expect(formatForExtension(".GPX")).toBe("gpx");
    expect(formatForExtension("gpx")).toBe("gpx");
    expect(formatForExtension("KMZ")).toBe("kmz");
  });

  it("returns null for unknown or generic extensions", () => {
    expect(formatForExtension(".zip")).toBeNull();
    expect(formatForExtension(".xml")).toBeNull();
    expect(formatForExtension(".txt")).toBeNull();
    expect(formatForExtension("")).toBeNull();
  });
});

describe("formatForMimeType", () => {
  it("matches the specific GPS MIME types", () => {
    expect(formatForMimeType("application/gpx+xml")).toBe("gpx");
    expect(formatForMimeType("application/vnd.garmin.tcx+xml")).toBe("tcx");
    expect(formatForMimeType("application/vnd.google-earth.kml+xml")).toBe(
      "kml",
    );
    expect(formatForMimeType("application/vnd.google-earth.kmz")).toBe("kmz");
  });

  it("ignores parameters and surrounding whitespace, case-insensitively", () => {
    expect(formatForMimeType("Application/GPX+XML; charset=utf-8")).toBe("gpx");
    expect(formatForMimeType("  application/vnd.google-earth.kmz  ")).toBe(
      "kmz",
    );
  });

  it("returns null for generic or unrelated MIME types", () => {
    expect(formatForMimeType("application/xml")).toBeNull();
    expect(formatForMimeType("application/zip")).toBeNull();
    expect(formatForMimeType("application/octet-stream")).toBeNull();
    expect(formatForMimeType("text/html")).toBeNull();
    expect(formatForMimeType("")).toBeNull();
  });
});
