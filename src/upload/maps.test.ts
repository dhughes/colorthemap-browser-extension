import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchMaps } from "./maps";

const BASE = "https://dev.colorthemap.app";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("fetchMaps", () => {
  it("GETs /api/v1/maps with the bearer token and trims to id + name", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse([
        {
          id: 1,
          name: "Trails",
          user_id: "u",
          track_color: "#ff00ff",
          track_count: 9,
        },
        {
          id: 7,
          name: "Rides",
          user_id: "u",
          track_color: "#000",
          track_count: 0,
        },
      ]),
    );

    const maps = await fetchMaps("access-xyz", BASE);

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/v1/maps`);
    expect(init.headers.Authorization).toBe("Bearer access-xyz");
    expect(maps).toEqual([
      { id: 1, name: "Trails" },
      { id: 7, name: "Rides" },
    ]);
  });

  it("returns an empty list when the user has no maps", async () => {
    fetchMock.mockResolvedValue(jsonResponse([]));
    expect(await fetchMaps("access-xyz", BASE)).toEqual([]);
  });

  it("throws CTM's detail message on a non-OK response", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ detail: "Could not validate credentials" }, 401),
    );
    await expect(fetchMaps("access-xyz", BASE)).rejects.toThrow(
      "Could not validate credentials",
    );
  });
});
