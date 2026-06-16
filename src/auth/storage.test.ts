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
        remove: vi.fn(async (keys: string | string[]) => {
          const targets = Array.isArray(keys) ? keys : [keys];
          for (const key of targets) store.delete(key);
        }),
      },
    },
  },
}));

import {
  clearAuth,
  getProfile,
  getTokens,
  setProfile,
  setTokens,
  type Profile,
  type Tokens,
} from "./storage";

const tokens: Tokens = {
  accessToken: "access-123",
  refreshToken: "refresh-456",
  expiresAt: 1_700_000_000_000,
};

const profile: Profile = {
  id: "user-1",
  email: "doug@example.com",
  firstName: "Doug",
  lastName: "Hughes",
  avatarUrl: "/api/v1/auth/avatar/user-1?v=1",
};

describe("auth storage", () => {
  beforeEach(() => store.clear());

  it("returns null when no tokens are stored", async () => {
    expect(await getTokens()).toBeNull();
  });

  it("round-trips tokens", async () => {
    await setTokens(tokens);
    expect(await getTokens()).toEqual(tokens);
  });

  it("returns null when no profile is stored", async () => {
    expect(await getProfile()).toBeNull();
  });

  it("round-trips a profile", async () => {
    await setProfile(profile);
    expect(await getProfile()).toEqual(profile);
  });

  it("clearAuth wipes both tokens and profile", async () => {
    await setTokens(tokens);
    await setProfile(profile);
    await clearAuth();
    expect(await getTokens()).toBeNull();
    expect(await getProfile()).toBeNull();
  });
});
