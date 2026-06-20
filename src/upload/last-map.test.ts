import { beforeEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, unknown>();

vi.mock("webextension-polyfill", () => ({
  default: {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const wanted = Array.isArray(keys) ? keys : [keys];
          const result: Record<string, unknown> = {};
          for (const key of wanted) {
            if (store.has(key)) result[key] = store.get(key);
          }
          return result;
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          for (const [key, value] of Object.entries(items)) {
            store.set(key, value);
          }
        }),
      },
    },
  },
}));

import { getLastMapForHost, setLastMapForHost } from "./last-map";

describe("per-site last-used map", () => {
  beforeEach(() => store.clear());

  it("returns null for a site that's never been used", async () => {
    expect(await getLastMapForHost("komoot.com")).toBeNull();
  });

  it("round-trips the last map for a host", async () => {
    await setLastMapForHost("komoot.com", 42);
    expect(await getLastMapForHost("komoot.com")).toBe(42);
  });

  it("keeps a separate choice per host", async () => {
    await setLastMapForHost("komoot.com", 42);
    await setLastMapForHost("strava.com", 7);
    expect(await getLastMapForHost("komoot.com")).toBe(42);
    expect(await getLastMapForHost("strava.com")).toBe(7);
  });

  it("overwrites the previous choice for the same host", async () => {
    await setLastMapForHost("komoot.com", 42);
    await setLastMapForHost("komoot.com", 99);
    expect(await getLastMapForHost("komoot.com")).toBe(99);
  });
});
