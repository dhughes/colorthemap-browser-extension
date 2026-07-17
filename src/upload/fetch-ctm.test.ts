import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadNetworkError, UploadServerError } from "./errors";
import { ctmFetch } from "./fetch-ctm";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("ctmFetch", () => {
  it("returns the response when CTM answers OK", async () => {
    const response = new Response("{}", { status: 200 });
    fetchMock.mockResolvedValue(response);

    await expect(ctmFetch("https://ctm/api")).resolves.toBe(response);
  });

  it("wraps a rejected fetch in UploadNetworkError, keeping the cause", async () => {
    const cause = new TypeError("Failed to fetch");
    fetchMock.mockRejectedValue(cause);

    const error = await ctmFetch("https://ctm/api").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UploadNetworkError);
    expect((error as UploadNetworkError).cause).toBe(cause);
  });

  it("wraps a non-OK response in UploadServerError with CTM's detail and status", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ detail: "Map not found" }), {
        status: 404,
      }),
    );

    const error = await ctmFetch("https://ctm/api").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(UploadServerError);
    expect((error as UploadServerError).status).toBe(404);
    expect((error as UploadServerError).message).toBe("Map not found");
  });
});
