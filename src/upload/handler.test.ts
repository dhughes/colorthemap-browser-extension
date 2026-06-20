import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/service", () => ({ getAccessToken: vi.fn() }));
vi.mock("./maps", () => ({ fetchMaps: vi.fn() }));
vi.mock("./service", () => ({ fetchFileBytes: vi.fn(), uploadTrack: vi.fn() }));

import { getAccessToken } from "../auth/service";
import { bytesToBase64 } from "../shared/base64";
import { fetchMaps } from "./maps";
import { handleUploadMessage } from "./handler";
import { listMapsMessage, uploadMessage } from "./messages";
import { fetchFileBytes, uploadTrack } from "./service";

const mocked = {
  getAccessToken: vi.mocked(getAccessToken),
  fetchMaps: vi.mocked(fetchMaps),
  fetchFileBytes: vi.mocked(fetchFileBytes),
  uploadTrack: vi.mocked(uploadTrack),
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked.getAccessToken.mockResolvedValue("access-xyz");
});

describe("handleUploadMessage routing", () => {
  it("returns undefined for messages it doesn't own", () => {
    expect(handleUploadMessage({ type: "ctm:something-else" })).toBeUndefined();
  });
});

describe("list-maps", () => {
  it("fetches maps with the access token", async () => {
    mocked.fetchMaps.mockResolvedValue([{ id: 1, name: "Trails" }]);

    const result = await handleUploadMessage(listMapsMessage());

    expect(mocked.fetchMaps).toHaveBeenCalledWith("access-xyz");
    expect(result).toEqual({ ok: true, maps: [{ id: 1, name: "Trails" }] });
  });

  it("returns an error result when not signed in", async () => {
    mocked.getAccessToken.mockRejectedValue(new Error("Not signed in"));

    const result = await handleUploadMessage(listMapsMessage());

    expect(result).toEqual({ ok: false, error: "Not signed in" });
  });
});

describe("upload", () => {
  const linkMessage = uploadMessage({
    mapId: 42,
    filename: "route.gpx",
    format: "gpx",
    url: "https://example.com/route.gpx",
  });

  it("re-fetches the URL when no bytes are supplied (link path)", async () => {
    const fetched = new ArrayBuffer(4);
    mocked.fetchFileBytes.mockResolvedValue(fetched);
    mocked.uploadTrack.mockResolvedValue({ status: "ok" });

    const result = await handleUploadMessage(linkMessage);

    expect(mocked.fetchFileBytes).toHaveBeenCalledWith(
      "https://example.com/route.gpx",
    );
    expect(mocked.uploadTrack).toHaveBeenCalledWith({
      accessToken: "access-xyz",
      mapId: 42,
      filename: "route.gpx",
      bytes: fetched,
    });
    expect(result).toEqual({ status: "ok" });
  });

  it("decodes captured base64 bytes without re-fetching (Detector A path)", async () => {
    const bytesBase64 = bytesToBase64(
      new TextEncoder().encode("<gpx/>").buffer,
    );
    mocked.uploadTrack.mockResolvedValue({ status: "ok" });

    await handleUploadMessage(uploadMessage({ ...linkMessage, bytesBase64 }));

    expect(mocked.fetchFileBytes).not.toHaveBeenCalled();
    const passed = mocked.uploadTrack.mock.calls[0]![0].bytes;
    expect(new TextDecoder().decode(passed)).toBe("<gpx/>");
  });

  it("returns an error result when the upload throws", async () => {
    mocked.fetchFileBytes.mockRejectedValue(new Error("Connection lost"));

    const result = await handleUploadMessage(linkMessage);

    expect(result).toEqual({ status: "error", detail: "Connection lost" });
  });
});
