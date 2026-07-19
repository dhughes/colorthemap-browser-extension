import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../auth/service", () => ({ getAccessToken: vi.fn() }));
vi.mock("./maps", () => ({ fetchMaps: vi.fn() }));
vi.mock("./service", () => ({
  fetchFileBytes: vi.fn(),
  uploadTracks: vi.fn(),
}));

import { getAccessToken } from "../auth/service";
import { TokenExpired } from "../auth/errors";
import { bytesToBase64 } from "../shared/base64";
import { UploadNetworkError, UploadServerError } from "./errors";
import { fetchMaps } from "./maps";
import { handleUploadMessage } from "./handler";
import { listMapsMessage, uploadMessage } from "./messages";
import { fetchFileBytes, uploadTracks } from "./service";

const mocked = {
  getAccessToken: vi.mocked(getAccessToken),
  fetchMaps: vi.mocked(fetchMaps),
  fetchFileBytes: vi.mocked(fetchFileBytes),
  uploadTracks: vi.mocked(uploadTracks),
};

const gpxBytes = () => new TextEncoder().encode("<gpx></gpx>").buffer;

const file = (over: Record<string, unknown> = {}) => ({
  filename: "route.gpx",
  format: "gpx" as const,
  url: "https://example.com/route.gpx",
  ...over,
});

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

  it("classifies an expired session as sign-in-required", async () => {
    mocked.getAccessToken.mockRejectedValue(new TokenExpired("no token"));

    const result = await handleUploadMessage(listMapsMessage());

    expect(result).toEqual({
      ok: false,
      reason: "sign-in-required",
      detail: "no token",
    });
  });

  it("classifies a network failure", async () => {
    mocked.fetchMaps.mockRejectedValue(new UploadNetworkError("offline"));

    const result = await handleUploadMessage(listMapsMessage());

    expect(result).toMatchObject({ ok: false, reason: "network" });
  });

  it("treats a 401 from CTM as sign-in-required, not a raw server error", async () => {
    mocked.fetchMaps.mockRejectedValue(
      new UploadServerError(401, "Not authenticated"),
    );

    const result = await handleUploadMessage(listMapsMessage());

    expect(result).toMatchObject({ ok: false, reason: "sign-in-required" });
  });

  it("keeps a 403 as a server error (authenticated but forbidden)", async () => {
    mocked.fetchMaps.mockRejectedValue(new UploadServerError(403, "Forbidden"));

    const result = await handleUploadMessage(listMapsMessage());

    expect(result).toMatchObject({ ok: false, reason: "server" });
  });
});

describe("upload (batch)", () => {
  it("re-fetches each link file and uploads what validates", async () => {
    mocked.fetchFileBytes.mockResolvedValue(gpxBytes());
    mocked.uploadTracks.mockResolvedValue({
      uploaded: 2,
      duplicates: 0,
      failed: 0,
      errors: [],
    });

    const result = await handleUploadMessage(
      uploadMessage({
        mapId: 42,
        files: [
          file({ url: "https://example.com/a.gpx" }),
          file({ url: "https://example.com/b.gpx" }),
        ],
      }),
    );

    expect(mocked.fetchFileBytes).toHaveBeenCalledTimes(2);
    const call = mocked.uploadTracks.mock.calls[0]![0];
    expect(call.accessToken).toBe("access-xyz");
    expect(call.mapId).toBe(42);
    expect(call.files.map((f) => f.filename)).toEqual([
      "route.gpx",
      "route.gpx",
    ]);
    expect(result).toEqual({
      status: "done",
      uploaded: 2,
      duplicates: 0,
      failed: 0,
      total: 2,
      errors: [],
    });
  });

  it("decodes captured base64 bytes without re-fetching (Detector A path)", async () => {
    const bytesBase64 = bytesToBase64(
      new TextEncoder().encode("<gpx/>").buffer,
    );
    mocked.uploadTracks.mockResolvedValue({
      uploaded: 1,
      duplicates: 0,
      failed: 0,
      errors: [],
    });

    await handleUploadMessage(
      uploadMessage({ mapId: 1, files: [file({ bytesBase64 })] }),
    );

    expect(mocked.fetchFileBytes).not.toHaveBeenCalled();
    const passed = mocked.uploadTracks.mock.calls[0]![0].files[0]!.bytes;
    expect(new TextDecoder().decode(passed)).toBe("<gpx/>");
  });

  it("counts a locally-invalid file as failed and keeps it out of the POST", async () => {
    // One real GPX, one HTML file the detector flagged as .gpx by extension.
    mocked.fetchFileBytes
      .mockResolvedValueOnce(gpxBytes())
      .mockResolvedValueOnce(
        new TextEncoder().encode("<!doctype html><html></html>").buffer,
      );
    mocked.uploadTracks.mockResolvedValue({
      uploaded: 1,
      duplicates: 0,
      failed: 0,
      errors: [],
    });

    const result = await handleUploadMessage(
      uploadMessage({
        mapId: 1,
        files: [
          file({ url: "https://example.com/real.gpx" }),
          file({ filename: "fake.gpx", url: "https://example.com/fake.gpx" }),
        ],
      }),
    );

    expect(mocked.uploadTracks.mock.calls[0]![0].files).toHaveLength(1);
    expect(result).toMatchObject({
      status: "done",
      uploaded: 1,
      failed: 1,
      total: 2,
    });
    expect((result as { errors: string[] }).errors[0]).toContain("GPX");
  });

  it("counts one file's re-fetch failure as failed without aborting the batch", async () => {
    // Good file first, then a link whose re-fetch rejects (expired URL etc.).
    mocked.fetchFileBytes
      .mockResolvedValueOnce(gpxBytes())
      .mockRejectedValueOnce(new Error("410 Gone"));
    mocked.uploadTracks.mockResolvedValue({
      uploaded: 1,
      duplicates: 0,
      failed: 0,
      errors: [],
    });

    const result = await handleUploadMessage(
      uploadMessage({
        mapId: 1,
        files: [
          file({ url: "https://example.com/real.gpx" }),
          file({ filename: "gone.gpx", url: "https://example.com/gone.gpx" }),
        ],
      }),
    );

    expect(mocked.uploadTracks.mock.calls[0]![0].files).toHaveLength(1);
    expect(result).toMatchObject({
      status: "done",
      uploaded: 1,
      failed: 1,
      total: 2,
    });
  });

  it("does not POST when every file fails local validation", async () => {
    mocked.fetchFileBytes.mockResolvedValue(
      new TextEncoder().encode("<!doctype html>").buffer,
    );

    const result = await handleUploadMessage(
      uploadMessage({ mapId: 1, files: [file()] }),
    );

    expect(mocked.uploadTracks).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      status: "done",
      uploaded: 0,
      failed: 1,
      total: 1,
    });
  });

  it("classifies an expired session as sign-in-required", async () => {
    mocked.getAccessToken.mockRejectedValue(new TokenExpired("expired"));

    const result = await handleUploadMessage(
      uploadMessage({ mapId: 1, files: [file()] }),
    );

    expect(result).toMatchObject({
      status: "error",
      reason: "sign-in-required",
    });
  });

  it("classifies a server error", async () => {
    mocked.fetchFileBytes.mockResolvedValue(gpxBytes());
    mocked.uploadTracks.mockRejectedValue(new UploadServerError(500, "boom"));

    const result = await handleUploadMessage(
      uploadMessage({ mapId: 1, files: [file()] }),
    );

    expect(result).toMatchObject({ status: "error", reason: "server" });
  });

  it("treats a 401 from CTM as sign-in-required", async () => {
    mocked.fetchFileBytes.mockResolvedValue(gpxBytes());
    mocked.uploadTracks.mockRejectedValue(
      new UploadServerError(401, "Not authenticated"),
    );

    const result = await handleUploadMessage(
      uploadMessage({ mapId: 1, files: [file()] }),
    );

    expect(result).toMatchObject({
      status: "error",
      reason: "sign-in-required",
    });
  });

  it("classifies an unexpected error as unknown", async () => {
    mocked.fetchFileBytes.mockResolvedValue(gpxBytes());
    mocked.uploadTracks.mockRejectedValue(new Error("???"));

    const result = await handleUploadMessage(
      uploadMessage({ mapId: 1, files: [file()] }),
    );

    expect(result).toMatchObject({ status: "error", reason: "unknown" });
  });
});
