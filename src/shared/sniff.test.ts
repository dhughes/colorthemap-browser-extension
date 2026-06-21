import { describe, expect, it } from "vitest";
import { matchesFormat, shouldSniffBody, sniffBytes } from "./sniff";

const encoder = new TextEncoder();

function bytes(text: string): Uint8Array {
  return encoder.encode(text);
}

function withPrefix(prefix: number[], text: string): Uint8Array {
  const tail = encoder.encode(text);
  const out = new Uint8Array(prefix.length + tail.length);
  out.set(prefix, 0);
  out.set(tail, prefix.length);
  return out;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];

describe("sniffBytes", () => {
  it("recognizes GPX by its XML root element", () => {
    expect(
      sniffBytes(bytes('<?xml version="1.0"?>\n<gpx version="1.1"></gpx>'), {}),
    ).toBe("gpx");
  });

  it("recognizes GPX even with a leading UTF-8 BOM", () => {
    expect(sniffBytes(withPrefix([0xef, 0xbb, 0xbf], "<gpx></gpx>"), {})).toBe(
      "gpx",
    );
  });

  it("recognizes TCX by its TrainingCenterDatabase root", () => {
    expect(
      sniffBytes(
        bytes(
          '<?xml version="1.0"?><TrainingCenterDatabase></TrainingCenterDatabase>',
        ),
        {},
      ),
    ).toBe("tcx");
  });

  it("recognizes KML by its root element", () => {
    expect(
      sniffBytes(bytes('<?xml version="1.0"?><kml xmlns="..."></kml>'), {}),
    ).toBe("kml");
  });

  it("recognizes FIT by the .FIT signature at byte offset 8", () => {
    const header = [0x0e, 0x10, 0x43, 0x08, 0x00, 0x00, 0x00, 0x00];
    const fitMarker = [0x2e, 0x46, 0x49, 0x54];
    const buf = new Uint8Array([...header, ...fitMarker, 0x00, 0x00]);
    expect(sniffBytes(buf, {})).toBe("fit");
  });

  it("recognizes KMZ only when the zip magic is corroborated by a .kmz URL", () => {
    const zip = new Uint8Array(ZIP_MAGIC);
    expect(sniffBytes(zip, { url: "https://example.com/tour.kmz" })).toBe(
      "kmz",
    );
  });

  it("recognizes KMZ when the zip magic is corroborated by the KMZ MIME type", () => {
    const zip = new Uint8Array(ZIP_MAGIC);
    expect(
      sniffBytes(zip, { contentType: "application/vnd.google-earth.kmz" }),
    ).toBe("kmz");
  });

  it("never classifies a bare zip as GPS without KMZ corroboration", () => {
    const zip = new Uint8Array(ZIP_MAGIC);
    expect(sniffBytes(zip, {})).toBeNull();
    expect(
      sniffBytes(zip, { url: "https://example.com/archive.zip" }),
    ).toBeNull();
    expect(sniffBytes(zip, { contentType: "application/zip" })).toBeNull();
  });

  it("does not classify generic XML, HTML, or empty bodies", () => {
    expect(
      sniffBytes(bytes('<?xml version="1.0"?><root></root>'), {}),
    ).toBeNull();
    expect(sniffBytes(bytes("<!doctype html><html></html>"), {})).toBeNull();
    expect(sniffBytes(new Uint8Array(0), {})).toBeNull();
  });

  it("does not mistake JSON that embeds GPX text for a GPX file", () => {
    // The shape GitHub's /_styled endpoint returns: a JSON document whose
    // string values quote the raw file, including '<gpx …>'.
    const json =
      '{"payload":{"rawLines":["<?xml version=\\"1.0\\"?>","<gpx version=\\"1.1\\"></gpx>"]}}';
    expect(sniffBytes(bytes(json), {})).toBeNull();
  });

  it("does not mistake an HTML page that mentions gpx for GPX", () => {
    expect(
      sniffBytes(
        bytes("<!doctype html><html><body><code>&lt;gpx&gt;</code>"),
        {},
      ),
    ).toBeNull();
  });

  it("still recognizes GPX preceded by a comment and whitespace", () => {
    expect(
      sniffBytes(
        bytes('\n  <!-- a route --><?xml version="1.0"?>\n<gpx></gpx>'),
        {},
      ),
    ).toBe("gpx");
  });
});

describe("matchesFormat", () => {
  it("confirms each format against its own signature", () => {
    expect(matchesFormat(bytes("<gpx></gpx>"), "gpx")).toBe(true);
    expect(matchesFormat(bytes("<TrainingCenterDatabase/>"), "tcx")).toBe(true);
    expect(matchesFormat(bytes('<kml xmlns="..."></kml>'), "kml")).toBe(true);
    expect(matchesFormat(new Uint8Array(ZIP_MAGIC), "kmz")).toBe(true);
    const fit = new Uint8Array([
      0x0e, 0x10, 0x43, 0x08, 0x00, 0x00, 0x00, 0x00, 0x2e, 0x46, 0x49, 0x54,
    ]);
    expect(matchesFormat(fit, "fit")).toBe(true);
  });

  it("rejects bytes whose content doesn't match the claimed format", () => {
    expect(matchesFormat(bytes("<!doctype html><html></html>"), "gpx")).toBe(
      false,
    );
    expect(matchesFormat(bytes("<Activities></Activities>"), "tcx")).toBe(
      false,
    );
    expect(matchesFormat(bytes("<Document></Document>"), "kml")).toBe(false);
    expect(matchesFormat(bytes("not a zip"), "kmz")).toBe(false);
    const badFit = new Uint8Array([
      0x0e, 0x10, 0x43, 0x08, 0x00, 0x00, 0x00, 0x00, 0x2e, 0x46, 0x49, 0x61,
    ]);
    expect(matchesFormat(badFit, "fit")).toBe(false);
  });

  it("validates a KMZ by zip magic alone — no extension/MIME corroboration", () => {
    // Unlike sniffBytes, matchesFormat trusts the claimed format, so a KMZ from
    // an extensionless URL still validates.
    expect(matchesFormat(new Uint8Array(ZIP_MAGIC), "kmz")).toBe(true);
  });
});

describe("shouldSniffBody", () => {
  it("sniffs when the content-type is a known GPS MIME", () => {
    expect(shouldSniffBody({ contentType: "application/gpx+xml" })).toBe(true);
  });

  it("sniffs when the URL resolves to a known format", () => {
    expect(shouldSniffBody({ url: "https://example.com/route.gpx" })).toBe(
      true,
    );
  });

  it("sniffs ambiguous download URLs (Komoot-style export endpoints)", () => {
    expect(
      shouldSniffBody({ url: "https://example.com/tours/1/export?format=gpx" }),
    ).toBe(true);
  });

  it("sniffs attachments whose filename carries a GPS extension", () => {
    expect(
      shouldSniffBody({
        contentDisposition: 'attachment; filename="route.gpx"',
      }),
    ).toBe(true);
  });

  it("skips responses with no GPS hint", () => {
    expect(
      shouldSniffBody({
        contentType: "text/html",
        url: "https://example.com/page",
      }),
    ).toBe(false);
    expect(shouldSniffBody({ contentType: "application/json" })).toBe(false);
    expect(shouldSniffBody({})).toBe(false);
  });
});
