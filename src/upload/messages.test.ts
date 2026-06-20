import { describe, expect, it } from "vitest";
import {
  UPLOAD_MESSAGE_TYPES,
  isListMapsMessage,
  isUploadMessage,
  listMapsMessage,
  uploadMessage,
} from "./messages";

describe("listMapsMessage", () => {
  it("stamps the discriminant type", () => {
    expect(listMapsMessage()).toEqual({ type: UPLOAD_MESSAGE_TYPES.listMaps });
  });
});

describe("uploadMessage", () => {
  const base = {
    mapId: 42,
    filename: "route.gpx",
    format: "gpx" as const,
    url: "https://example.com/route.gpx",
  };

  it("builds a re-fetch (link) request with no bytes", () => {
    const message = uploadMessage(base);
    expect(message).toEqual({ type: UPLOAD_MESSAGE_TYPES.upload, ...base });
    expect("bytesBase64" in message).toBe(false);
  });

  it("carries captured bytes (base64) when provided", () => {
    const message = uploadMessage({ ...base, bytesBase64: "PGdweC8+" });
    expect(message.bytesBase64).toBe("PGdweC8+");
  });
});

describe("isListMapsMessage", () => {
  it("accepts a well-formed list-maps message", () => {
    expect(isListMapsMessage(listMapsMessage())).toBe(true);
  });

  it("rejects other shapes", () => {
    expect(isListMapsMessage({ type: "other" })).toBe(false);
    expect(isListMapsMessage(null)).toBe(false);
    expect(
      isListMapsMessage(
        uploadMessage({
          mapId: 1,
          filename: "a.gpx",
          format: "gpx",
          url: "https://x/a.gpx",
        }),
      ),
    ).toBe(false);
  });
});

describe("isUploadMessage", () => {
  const valid = uploadMessage({
    mapId: 42,
    filename: "route.gpx",
    format: "gpx",
    url: "https://example.com/route.gpx",
  });

  it("accepts a well-formed upload message", () => {
    expect(isUploadMessage(valid)).toBe(true);
  });

  it("accepts an upload message carrying base64 bytes", () => {
    expect(isUploadMessage({ ...valid, bytesBase64: "PGdweC8+" })).toBe(true);
  });

  it("rejects a non-number mapId", () => {
    expect(isUploadMessage({ ...valid, mapId: "42" })).toBe(false);
  });

  it("rejects an unknown format", () => {
    expect(isUploadMessage({ ...valid, format: "zip" })).toBe(false);
  });

  it("rejects a non-string filename or url", () => {
    expect(isUploadMessage({ ...valid, filename: 1 })).toBe(false);
    expect(isUploadMessage({ ...valid, url: null })).toBe(false);
  });

  it("rejects non-http(s) URLs (no file:/data: re-fetch)", () => {
    expect(isUploadMessage({ ...valid, url: "file:///etc/passwd" })).toBe(
      false,
    );
    expect(isUploadMessage({ ...valid, url: "data:text/xml,<gpx/>" })).toBe(
      false,
    );
    expect(isUploadMessage({ ...valid, url: "not a url" })).toBe(false);
  });

  it("rejects bytesBase64 that isn't a string", () => {
    expect(isUploadMessage({ ...valid, bytesBase64: 123 })).toBe(false);
  });

  it("rejects the wrong type and non-objects", () => {
    expect(isUploadMessage({ ...valid, type: "other" })).toBe(false);
    expect(isUploadMessage(undefined)).toBe(false);
  });
});
