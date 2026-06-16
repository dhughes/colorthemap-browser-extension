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
const TCX =
  '<?xml version="1.0"?><TrainingCenterDatabase></TrainingCenterDatabase>';
const FIT = new Uint8Array([
  0x0e, 0x10, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x2e, 0x46, 0x49, 0x54, 0x00,
  0x00,
]);

describe("classifyResponse", () => {
  it("confirms a .gpx URL only when the body really is GPX", async () => {
    expect(
      await classifyResponse({
        url: "https://example.com/route.gpx",
        body: stream(GPX),
      }),
    ).toBe("gpx");
  });

  it("does not trust a .gpx URL whose body is not GPS data", async () => {
    expect(
      await classifyResponse({
        url: "https://example.com/route.gpx",
        body: stream("not actually gps"),
      }),
    ).toBeNull();
  });

  it("rejects a .gpx URL that returns JSON, even with no content-type", async () => {
    // Any SPA can serve arbitrary bytes at a .gpx-suffixed path; the body
    // decides. Content-type is often missing (service-worker responses).
    expect(
      await classifyResponse({
        url: "https://any.example/repo/_styled/master/x/archies_fr.gpx",
        body: stream('{"payload":{"blob":"…"}}'),
      }),
    ).toBeNull();
  });

  it("rejects a .gpx URL that returns an HTML page", async () => {
    expect(
      await classifyResponse({
        url: "https://any.example/repo/blob/master/x/archies_fr.gpx",
        contentType: "text/html; charset=utf-8",
        body: stream("<!doctype html><html><body>file page</body></html>"),
      }),
    ).toBeNull();
  });

  it("confirms via a content-disposition filename plus a matching body", async () => {
    expect(
      await classifyResponse({
        url: "https://example.com/download",
        contentDisposition: 'attachment; filename="ride.tcx"',
        body: stream(TCX),
      }),
    ).toBe("tcx");
  });

  it("sniffs a body when only the URL is ambiguous (export endpoint)", async () => {
    expect(
      await classifyResponse({
        url: "https://example.com/tours/1/export?format=gpx",
        body: stream(GPX),
      }),
    ).toBe("gpx");
  });

  it("sniffs a binary FIT body — parity with the fetch path", async () => {
    expect(
      await classifyResponse({
        url: "https://example.com/activities/1/export?token=abc",
        body: stream(FIT),
      }),
    ).toBe("fit");
  });

  it("returns null when an ambiguous URL yields a non-GPS body", async () => {
    expect(
      await classifyResponse({
        url: "https://example.com/export?token=abc",
        body: stream("<html></html>"),
      }),
    ).toBeNull();
  });

  it("trusts an explicit GPS content-type when there is no body to sniff", async () => {
    expect(
      await classifyResponse({
        url: "https://example.com/route.gpx",
        contentType: "application/gpx+xml",
        body: null,
      }),
    ).toBe("gpx");
  });

  it("does not read the body when nothing hints at GPS", async () => {
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
