import { describe, expect, it } from "vitest";
import { classifyResponse } from "./response-sniff";

function stream(data: string | Uint8Array): ReadableStream<Uint8Array> {
  const body = new Response(data as BodyInit).body;
  if (!body) {
    throw new Error("expected a readable body");
  }
  return body;
}

const GPX = '<?xml version="1.0"?><gpx version="1.1"></gpx>';
const FIT = new Uint8Array([
  0x0e, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2e, 0x46, 0x49, 0x54, 0x00,
  0x00,
]);

describe("classifyResponse", () => {
  it("classifies by URL extension without reading the body", async () => {
    const result = await classifyResponse({
      url: "https://example.com/route.gpx",
      body: stream("not actually gps"),
    });
    expect(result).toBe("gpx");
  });

  it("classifies by a content-disposition filename when the URL has none", async () => {
    const result = await classifyResponse({
      url: "https://example.com/download",
      contentDisposition: 'attachment; filename="ride.tcx"',
      body: null,
    });
    expect(result).toBe("tcx");
  });

  it("sniffs a text body when only the URL is ambiguous", async () => {
    const result = await classifyResponse({
      url: "https://example.com/tours/1/export?format=gpx",
      body: stream(GPX),
    });
    expect(result).toBe("gpx");
  });

  it("sniffs a binary FIT body — parity with the fetch path", async () => {
    const result = await classifyResponse({
      url: "https://example.com/activities/1/export?token=abc",
      body: stream(FIT),
    });
    expect(result).toBe("fit");
  });

  it("returns null when an ambiguous URL yields a non-GPS body", async () => {
    const result = await classifyResponse({
      url: "https://example.com/export?token=abc",
      body: stream("<html></html>"),
    });
    expect(result).toBeNull();
  });

  it("does not trust a .gpx URL when the response is HTML (GitHub SPA route)", async () => {
    const result = await classifyResponse({
      url: "https://github.com/owner/repo/blob/master/Campsites/archies_fr.gpx",
      contentType: "text/html; charset=utf-8",
      body: stream("<!doctype html><html><body>file page</body></html>"),
    });
    expect(result).toBeNull();
  });

  it("does not trust a .gpx URL when the response is JSON metadata", async () => {
    const result = await classifyResponse({
      url: "https://github.com/owner/repo/latest-commit/master/x/archies_fr.gpx",
      contentType: "application/json",
      body: stream('{"oid":"abc"}'),
    });
    expect(result).toBeNull();
  });

  it("still classifies a real GPX served correctly (not vetoed)", async () => {
    const result = await classifyResponse({
      url: "https://example.com/route.gpx",
      contentType: "application/gpx+xml",
      body: null,
    });
    expect(result).toBe("gpx");
  });

  it("falls through to sniff when content-type lies but the body really is GPX", async () => {
    const result = await classifyResponse({
      url: "https://example.com/route.gpx",
      contentType: "text/html",
      body: stream(GPX),
    });
    expect(result).toBe("gpx");
  });

  it("does not read the body when no signal hints at GPS", async () => {
    let read = false;
    const watched = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          read = true;
          controller.enqueue(new TextEncoder().encode(GPX));
          controller.close();
        },
      },
      { highWaterMark: 0 },
    );
    const result = await classifyResponse({
      url: "https://example.com/api/data",
      contentType: "application/octet-stream",
      body: watched,
    });
    expect(result).toBeNull();
    expect(read).toBe(false);
  });
});
