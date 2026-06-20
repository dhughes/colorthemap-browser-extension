import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchFileBytes, uploadTrack } from "./service";

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

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("uploadTrack", () => {
  const bytes = new TextEncoder().encode("<gpx></gpx>").buffer;

  it("POSTs multipart to the map's tracks endpoint with the file and bearer", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(batch({ uploaded: 1, track_ids: [99] })),
    );

    const result = await uploadTrack({
      accessToken: "access-xyz",
      mapId: 42,
      filename: "route.gpx",
      bytes,
      baseUrl: BASE,
    });

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/v1/maps/42/tracks`);
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer access-xyz");
    expect(init.body).toBeInstanceOf(FormData);
    const file = (init.body as FormData).get("files") as File;
    expect(file.name).toBe("route.gpx");
    expect(result).toEqual({ status: "ok" });
  });

  it("sanitizes the filename before sending it to CTM", async () => {
    fetchMock.mockResolvedValue(jsonResponse(batch({ uploaded: 1 })));

    await uploadTrack({
      accessToken: "t",
      mapId: 1,
      filename: "../../etc/<evil>.gpx",
      bytes,
      baseUrl: BASE,
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const file = (init.body as FormData).get("files") as File;
    expect(file.name).toBe("_evil_.gpx");
  });

  it("surfaces CTM's parse error verbatim when the file fails to import", async () => {
    const reason =
      "route.kml: Unsupported file type (use .gpx, .csv, .fit, .fit.gz, .tcx, .kml, or .kmz)";
    fetchMock.mockResolvedValue(
      jsonResponse(batch({ failed: 1, errors: [reason] })),
    );

    const result = await uploadTrack({
      accessToken: "t",
      mapId: 1,
      filename: "route.kml",
      bytes,
      baseUrl: BASE,
    });

    expect(result).toEqual({ status: "error", detail: reason });
  });

  it("treats failed > 0 as an error even when CTM sends no error strings", async () => {
    fetchMock.mockResolvedValue(jsonResponse(batch({ failed: 1, errors: [] })));

    const result = await uploadTrack({
      accessToken: "t",
      mapId: 1,
      filename: "route.gpx",
      bytes,
      baseUrl: BASE,
    });

    expect(result.status).toBe("error");
    expect(result.detail).toBeTruthy();
  });

  it("does not claim success when nothing was uploaded, failed, or duplicated", async () => {
    fetchMock.mockResolvedValue(jsonResponse(batch()));

    const result = await uploadTrack({
      accessToken: "t",
      mapId: 1,
      filename: "route.gpx",
      bytes,
      baseUrl: BASE,
    });

    expect(result.status).toBe("error");
  });

  it("reports a duplicate when CTM already has the track", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(batch({ duplicates: ["route.gpx"] })),
    );

    const result = await uploadTrack({
      accessToken: "t",
      mapId: 1,
      filename: "route.gpx",
      bytes,
      baseUrl: BASE,
    });

    expect(result.status).toBe("duplicate");
  });

  it("surfaces CTM's detail on a non-OK response (e.g. foreign map)", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "Map not found" }, 404));

    const result = await uploadTrack({
      accessToken: "t",
      mapId: 999,
      filename: "route.gpx",
      bytes,
      baseUrl: BASE,
    });

    expect(result).toEqual({ status: "error", detail: "Map not found" });
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

  it("throws CTM's message when the file fetch fails", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 403 }));
    await expect(
      fetchFileBytes("https://example.com/route.gpx"),
    ).rejects.toThrow("nope");
  });
});
