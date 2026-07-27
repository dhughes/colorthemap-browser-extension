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

import { getAllowPrivateHosts, setAllowPrivateHosts } from "./settings";

describe("allowPrivateHosts setting", () => {
  beforeEach(() => store.clear());

  it("defaults to false when never set", async () => {
    expect(await getAllowPrivateHosts()).toBe(false);
  });

  it("round-trips true", async () => {
    await setAllowPrivateHosts(true);
    expect(await getAllowPrivateHosts()).toBe(true);
  });

  it("round-trips back to false", async () => {
    await setAllowPrivateHosts(true);
    await setAllowPrivateHosts(false);
    expect(await getAllowPrivateHosts()).toBe(false);
  });
});
