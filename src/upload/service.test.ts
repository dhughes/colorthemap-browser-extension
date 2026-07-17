import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadNetworkError, UploadServerError } from "./errors";
import { fetchFileBytes, uploadTracks } from "./service";

const BASE = "https://dev.colorthemap.app";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const batch = (over: Partial<Record<string, unknown>> = {}) => ({
  uploaded: 0,
  failed: 0,
  track_ids: [],
  errors: [],
  duplicates: [],
  cross_source_duplicates: [],
  ...over,
});

const bytes = (text: string): ArrayBuffer =>
  new TextEncoder().encode(text).buffer;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("uploadTracks", () => {
  it("POSTs one multipart request carrying every file under the same key", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(batch({ uploaded: 2, track_ids: [98, 99] })),
    );

    const result = await uploadTracks({
      accessToken: "access-xyz",
      mapId: 42,
      files: [
        { filename: "ride.gpx", bytes: bytes("<gpx/>") },
        { filename: "walk.kml", bytes: bytes("<kml/>") },
      ],
      baseUrl: BASE,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/v1/maps/42/tracks`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer access-xyz");
    const files = (init.body as FormData).getAll("files") as File[];
    expect(files.map((f) => f.name)).toEqual(["ride.gpx", "walk.kml"]);
    expect(result).toEqual({
      uploaded: 2,
      duplicates: 0,
      failed: 0,
      errors: [],
    });
  });

  it("sanitizes every filename before sending it to CTM", async () => {
    fetchMock.mockResolvedValue(jsonResponse(batch({ uploaded: 2 })));

    await uploadTracks({
      accessToken: "t",
      mapId: 1,
      files: [
        { filename: "../../etc/<evil>.gpx", bytes: bytes("<gpx/>") },
        { filename: "fine.gpx", bytes: bytes("<gpx/>") },
      ],
      baseUrl: BASE,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const files = (init.body as FormData).getAll("files") as File[];
    expect(files.map((f) => f.name)).toEqual(["_evil_.gpx", "fine.gpx"]);
  });

  it("keeps CTM's per-file error lines verbatim in the counts", async () => {
    const reason =
      "route.kml: Unsupported file type (use .gpx, .csv, .fit, .fit.gz, .tcx, .kml, or .kmz)";
    fetchMock.mockResolvedValue(
      jsonResponse(batch({ uploaded: 1, failed: 1, errors: [reason] })),
    );

    const result = await uploadTracks({
      accessToken: "t",
      mapId: 1,
      files: [
        { filename: "ride.gpx", bytes: bytes("<gpx/>") },
        { filename: "route.kml", bytes: bytes("<kml/>") },
      ],
      baseUrl: BASE,
    });

    expect(result).toEqual({
      uploaded: 1,
      duplicates: 0,
      failed: 1,
      errors: [reason],
    });
  });

  it("counts same-source and cross-source duplicates together", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        batch({
          duplicates: ["ride.gpx"],
          cross_source_duplicates: ["walk.kml"],
        }),
      ),
    );

    const result = await uploadTracks({
      accessToken: "t",
      mapId: 1,
      files: [
        { filename: "ride.gpx", bytes: bytes("<gpx/>") },
        { filename: "walk.kml", bytes: bytes("<kml/>") },
      ],
      baseUrl: BASE,
    });

    expect(result.duplicates).toBe(2);
  });

  it("throws a typed server error carrying CTM's detail on a non-OK response", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Map not found" }, 404));

    const error = await uploadTracks({
      accessToken: "t",
      mapId: 999,
      files: [{ filename: "ride.gpx", bytes: bytes("<gpx/>") }],
      baseUrl: BASE,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UploadServerError);
    expect((error as UploadServerError).status).toBe(404);
    expect((error as UploadServerError).message).toBe("Map not found");
  });

  it("throws a typed network error when the request never reaches CTM", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await uploadTracks({
      accessToken: "t",
      mapId: 1,
      files: [{ filename: "ride.gpx", bytes: bytes("<gpx/>") }],
      baseUrl: BASE,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UploadNetworkError);
  });
});

describe("fetchFileBytes", () => {
  it("fetches the URL with credentials and returns the bytes", async () => {
    fetchMock.mockResolvedValue(new Response("<gpx></gpx>", { status: 200 }));

    const buffer = await fetchFileBytes("https://example.com/route.gpx");

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://example.com/route.gpx");
    expect(init.credentials).toBe("include");
    expect(new TextDecoder().decode(buffer)).toBe("<gpx></gpx>");
  });

  it("throws the site's message when the file fetch fails", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(
      fetchFileBytes("https://example.com/route.gpx"),
    ).rejects.toThrow("nope");
  });
});
