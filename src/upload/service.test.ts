import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadNetworkError } from "./errors";
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
  it("POSTs each file in its own request (one file per request)", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(batch({ uploaded: 1 })),
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

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/v1/maps/42/tracks`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer access-xyz");
    for (const [, callInit] of fetchMock.mock.calls) {
      expect((callInit.body as FormData).getAll("files")).toHaveLength(1);
    }
    const names = fetchMock.mock.calls.map(
      ([, callInit]) => ((callInit.body as FormData).get("files") as File).name,
    );
    expect(names).toEqual(["ride.gpx", "walk.kml"]);
    expect(result).toEqual({
      uploaded: 2,
      duplicates: 0,
      failed: 0,
      errors: [],
    });
  });

  it("sanitizes each filename before sending it to CTM", async () => {
    fetchMock.mockImplementation(async () =>
      jsonResponse(batch({ uploaded: 1 })),
    );

    await uploadTracks({
      accessToken: "t",
      mapId: 1,
      files: [
        { filename: "../../etc/<evil>.gpx", bytes: bytes("<gpx/>") },
        { filename: "fine.gpx", bytes: bytes("<gpx/>") },
      ],
      baseUrl: BASE,
    });

    const names = fetchMock.mock.calls.map(
      ([, init]) => ((init.body as FormData).get("files") as File).name,
    );
    expect(names).toEqual(["_evil_.gpx", "fine.gpx"]);
  });

  it("aggregates per-file failures and CTM's error lines across requests", async () => {
    const reason =
      "route.kml: Unsupported file type (use .gpx, .csv, .fit, .fit.gz, .tcx, .kml, or .kmz)";
    fetchMock
      .mockResolvedValueOnce(jsonResponse(batch({ uploaded: 1 })))
      .mockResolvedValueOnce(
        jsonResponse(batch({ failed: 1, errors: [reason] })),
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
    fetchMock
      .mockResolvedValueOnce(jsonResponse(batch({ duplicates: ["ride.gpx"] })))
      .mockResolvedValueOnce(
        jsonResponse(batch({ cross_source_duplicates: ["walk.kml"] })),
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

  it("tallies one file's server rejection and keeps going", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(batch({ uploaded: 1 })))
      .mockResolvedValueOnce(jsonResponse({ detail: "No track points" }, 422));

    const result = await uploadTracks({
      accessToken: "t",
      mapId: 1,
      files: [
        { filename: "ride.gpx", bytes: bytes("<gpx/>") },
        { filename: "empty.gpx", bytes: bytes("<gpx/>") },
      ],
      baseUrl: BASE,
    });

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toBe("empty.gpx: No track points");
  });

  it("maps a bodyless client error to a friendly per-file reason", async () => {
    // A 400 with no JSON detail — "HTTP 400" would help nobody.
    fetchMock.mockResolvedValueOnce(new Response("", { status: 400 }));

    const result = await uploadTracks({
      accessToken: "t",
      mapId: 1,
      files: [{ filename: "server-reject.gpx", bytes: bytes("<gpx/>") }],
      baseUrl: BASE,
    });

    expect(result.failed).toBe(1);
    expect(result.errors[0]).toBe(
      "server-reject.gpx: couldn't read a track from the file",
    );
  });

  it("aborts the whole send on a network failure when nothing has landed", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    const error = await uploadTracks({
      accessToken: "t",
      mapId: 1,
      files: [{ filename: "ride.gpx", bytes: bytes("<gpx/>") }],
      baseUrl: BASE,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UploadNetworkError);
  });

  it("keeps earlier successes when the connection drops mid-batch", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(batch({ uploaded: 1 })))
      .mockRejectedValueOnce(new TypeError("Failed to fetch"));

    const result = await uploadTracks({
      accessToken: "t",
      mapId: 1,
      files: [
        { filename: "ride.gpx", bytes: bytes("<gpx/>") },
        { filename: "walk.gpx", bytes: bytes("<gpx/>") },
      ],
      baseUrl: BASE,
    });

    expect(result.uploaded).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toContain("couldn't reach Color The Map");
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
