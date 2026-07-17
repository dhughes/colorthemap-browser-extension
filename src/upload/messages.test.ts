import { describe, expect, it } from "vitest";
import {
  UPLOAD_MESSAGE_TYPES,
  isListMapsMessage,
  isOpenToastMessage,
  isUploadMessage,
  listMapsMessage,
  openToastMessage,
  uploadMessage,
  type UploadFileInput,
} from "./messages";

const file = (over: Partial<UploadFileInput> = {}): UploadFileInput => ({
  filename: "route.gpx",
  format: "gpx",
  url: "https://example.com/route.gpx",
  ...over,
});

describe("listMapsMessage", () => {
  it("stamps the discriminant type", () => {
    expect(listMapsMessage()).toEqual({ type: UPLOAD_MESSAGE_TYPES.listMaps });
  });
});

describe("uploadMessage", () => {
  it("builds a batch request carrying every file", () => {
    const files = [file(), file({ filename: "walk.kml", format: "kml" })];
    expect(uploadMessage({ mapId: 42, files })).toEqual({
      type: UPLOAD_MESSAGE_TYPES.upload,
      mapId: 42,
      files,
    });
  });

  it("carries captured bytes (base64) per file when provided", () => {
    const message = uploadMessage({
      mapId: 1,
      files: [
        file({ bytesBase64: "PGdweC8+" }),
        file({ url: "https://x/b.gpx" }),
      ],
    });
    expect(message.files[0]!.bytesBase64).toBe("PGdweC8+");
    expect("bytesBase64" in message.files[1]!).toBe(false);
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
      isListMapsMessage(uploadMessage({ mapId: 1, files: [file()] })),
    ).toBe(false);
  });
});

describe("isUploadMessage", () => {
  const valid = uploadMessage({ mapId: 42, files: [file()] });

  it("accepts a well-formed single-file batch", () => {
    expect(isUploadMessage(valid)).toBe(true);
  });

  it("accepts a multi-file batch with mixed bytes presence", () => {
    expect(
      isUploadMessage(
        uploadMessage({
          mapId: 42,
          files: [
            file({ bytesBase64: "PGdweC8+" }),
            file({ filename: "b.fit", format: "fit", url: "https://x/b.fit" }),
          ],
        }),
      ),
    ).toBe(true);
  });

  it("rejects an empty files array", () => {
    expect(isUploadMessage({ ...valid, files: [] })).toBe(false);
  });

  it("rejects files that isn't an array of file inputs", () => {
    expect(isUploadMessage({ ...valid, files: file() })).toBe(false);
    expect(isUploadMessage({ ...valid, files: [file(), "route.gpx"] })).toBe(
      false,
    );
  });

  it("rejects a non-number mapId", () => {
    expect(isUploadMessage({ ...valid, mapId: "42" })).toBe(false);
  });

  it("rejects a file with an unknown format", () => {
    expect(
      isUploadMessage({ ...valid, files: [file({ format: "zip" as never })] }),
    ).toBe(false);
  });

  it("rejects a file with a non-string filename", () => {
    expect(
      isUploadMessage({ ...valid, files: [file({ filename: 1 as never })] }),
    ).toBe(false);
  });

  it("rejects non-http(s) file URLs (no file:/data: re-fetch)", () => {
    expect(
      isUploadMessage({
        ...valid,
        files: [file({ url: "file:///etc/passwd" })],
      }),
    ).toBe(false);
    expect(
      isUploadMessage({
        ...valid,
        files: [file({ url: "data:text/xml,<gpx/>" })],
      }),
    ).toBe(false);
    expect(
      isUploadMessage({ ...valid, files: [file({ url: "not a url" })] }),
    ).toBe(false);
  });

  it("rejects a file whose bytesBase64 isn't a string", () => {
    expect(
      isUploadMessage({
        ...valid,
        files: [file({ bytesBase64: 123 as never })],
      }),
    ).toBe(false);
  });

  it("rejects the wrong type and non-objects", () => {
    expect(isUploadMessage({ ...valid, type: "other" })).toBe(false);
    expect(isUploadMessage(undefined)).toBe(false);
  });
});

describe("openToastMessage", () => {
  const params = {
    url: "https://example.com/route?format=gpx",
    filename: "route.gpx",
    format: "gpx" as const,
  };

  it("stamps the discriminant type and carries the payload", () => {
    expect(openToastMessage(params)).toEqual({
      type: UPLOAD_MESSAGE_TYPES.openToast,
      ...params,
    });
  });
});

describe("isOpenToastMessage", () => {
  const valid = openToastMessage({
    url: "https://example.com/route?format=gpx",
    filename: "route.gpx",
    format: "gpx",
  });

  it("accepts a well-formed open-toast message", () => {
    expect(isOpenToastMessage(valid)).toBe(true);
  });

  it("rejects an unknown format, non-http url, or wrong type", () => {
    expect(isOpenToastMessage({ ...valid, format: "zip" })).toBe(false);
    expect(isOpenToastMessage({ ...valid, url: "file:///x.gpx" })).toBe(false);
    expect(isOpenToastMessage({ ...valid, type: "other" })).toBe(false);
    expect(isOpenToastMessage(null)).toBe(false);
  });
});
