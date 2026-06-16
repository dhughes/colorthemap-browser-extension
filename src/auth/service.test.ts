import { beforeEach, describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";
import * as api from "./api";
import * as storage from "./storage";
import { AuthorizationFailed } from "./errors";
import { AUTH_MESSAGE_TYPES } from "./messages";
import {
  getAccessToken,
  logout,
  needsRefresh,
  refreshIfNeeded,
  startAuthFlow,
} from "./service";
import type { TokenSet } from "./api";
import type { Profile, Tokens } from "./storage";

vi.mock("webextension-polyfill", () => ({
  default: {
    identity: {
      getRedirectURL: vi.fn(() => REDIRECT),
      launchWebAuthFlow: vi.fn(),
    },
    runtime: {
      sendMessage: vi.fn(async () => undefined),
      openOptionsPage: vi.fn(async () => undefined),
    },
  },
}));

vi.mock("./storage");

vi.mock("./api", async (importActual) => {
  const actual = await importActual<typeof import("./api")>();
  return {
    ...actual,
    exchangeCode: vi.fn(),
    refreshTokens: vi.fn(),
    fetchProfile: vi.fn(),
  };
});

const REDIRECT = "https://abc.chromiumapp.org/";

const profile: Profile = {
  id: "u1",
  email: "doug@example.com",
  firstName: "Doug",
  lastName: "Hughes",
  avatarUrl: null,
};

function tokens(overrides: Partial<Tokens> = {}): Tokens {
  return {
    accessToken: "access-old",
    refreshToken: "refresh-old",
    expiresAt: Date.now() + 60 * 60 * 1000,
    ...overrides,
  };
}

function tokenSet(overrides: Partial<TokenSet> = {}): TokenSet {
  return {
    accessToken: "access-new",
    refreshToken: "refresh-new",
    expiresAt: Date.now() + 60 * 60 * 1000,
    scope: "ctm:full",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("needsRefresh", () => {
  it("is true within 120s of expiry and false well before", () => {
    const now = 1_000_000;
    expect(needsRefresh(tokens({ expiresAt: now + 60_000 }), now)).toBe(true);
    expect(needsRefresh(tokens({ expiresAt: now + 600_000 }), now)).toBe(false);
  });
});

describe("getAccessToken", () => {
  it("returns the cached token without refreshing when it is fresh", async () => {
    vi.mocked(storage.getTokens).mockResolvedValue(tokens());
    expect(await getAccessToken()).toBe("access-old");
    expect(api.refreshTokens).not.toHaveBeenCalled();
  });

  it("refreshes and persists when the token is stale", async () => {
    vi.mocked(storage.getTokens).mockResolvedValue(
      tokens({ expiresAt: Date.now() + 10_000 }),
    );
    const next = tokenSet();
    vi.mocked(api.refreshTokens).mockResolvedValue(next);

    expect(await getAccessToken()).toBe("access-new");
    expect(api.refreshTokens).toHaveBeenCalledWith({
      baseUrl: expect.any(String),
      refreshToken: "refresh-old",
    });
    expect(storage.setTokens).toHaveBeenCalledWith(next);
  });

  it("coalesces concurrent callers into a single refresh (single-flight)", async () => {
    vi.mocked(storage.getTokens).mockResolvedValue(
      tokens({ expiresAt: Date.now() + 10_000 }),
    );
    let resolveRefresh!: (t: TokenSet) => void;
    vi.mocked(api.refreshTokens).mockReturnValue(
      new Promise<TokenSet>((resolve) => {
        resolveRefresh = resolve;
      }),
    );

    const callers = Promise.all([
      getAccessToken(),
      getAccessToken(),
      getAccessToken(),
    ]);
    await Promise.resolve();
    resolveRefresh(tokenSet());
    const results = await callers;

    expect(results).toEqual(["access-new", "access-new", "access-new"]);
    expect(api.refreshTokens).toHaveBeenCalledTimes(1);
  });

  it("throws TokenExpired when nothing is stored", async () => {
    vi.mocked(storage.getTokens).mockResolvedValue(null);
    await expect(getAccessToken()).rejects.toMatchObject({
      name: "TokenExpired",
    });
  });

  it("on refresh failure wipes state, broadcasts logged-out, and throws TokenExpired", async () => {
    vi.mocked(storage.getTokens).mockResolvedValue(
      tokens({ expiresAt: Date.now() + 10_000 }),
    );
    vi.mocked(storage.getProfile).mockResolvedValue(null);
    vi.mocked(api.refreshTokens).mockRejectedValue(
      new AuthorizationFailed("invalid_grant"),
    );

    await expect(getAccessToken()).rejects.toMatchObject({
      name: "TokenExpired",
    });
    expect(storage.clearAuth).toHaveBeenCalled();
    const message = vi.mocked(browser.runtime.sendMessage).mock.calls[0]![0];
    expect(message).toMatchObject({
      type: AUTH_MESSAGE_TYPES.authStateChanged,
      state: { status: "unauthenticated" },
    });
  });
});

describe("refreshIfNeeded", () => {
  it("refreshes proactively when stale", async () => {
    vi.mocked(storage.getTokens).mockResolvedValue(
      tokens({ expiresAt: Date.now() + 10_000 }),
    );
    vi.mocked(api.refreshTokens).mockResolvedValue(tokenSet());
    await refreshIfNeeded();
    expect(api.refreshTokens).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the token is still fresh", async () => {
    vi.mocked(storage.getTokens).mockResolvedValue(tokens());
    await refreshIfNeeded();
    expect(api.refreshTokens).not.toHaveBeenCalled();
  });

  it("does nothing when not signed in", async () => {
    vi.mocked(storage.getTokens).mockResolvedValue(null);
    await refreshIfNeeded();
    expect(api.refreshTokens).not.toHaveBeenCalled();
  });
});

describe("logout", () => {
  it("wipes local state and broadcasts logged-out", async () => {
    vi.mocked(storage.getTokens).mockResolvedValue(null);
    vi.mocked(storage.getProfile).mockResolvedValue(null);
    await logout();
    expect(storage.clearAuth).toHaveBeenCalled();
    const message = vi.mocked(browser.runtime.sendMessage).mock.calls[0]![0];
    expect(message).toMatchObject({
      type: AUTH_MESSAGE_TYPES.authStateChanged,
      state: { status: "unauthenticated" },
    });
  });
});

describe("startAuthFlow", () => {
  it("runs PKCE → launchWebAuthFlow → exchange → store profile → broadcast", async () => {
    vi.mocked(browser.identity.launchWebAuthFlow).mockImplementation(
      async (details) => {
        const state = new URL(details.url).searchParams.get("state");
        return `${REDIRECT}?code=auth-code&state=${state}`;
      },
    );
    const issued = tokenSet();
    vi.mocked(api.exchangeCode).mockResolvedValue(issued);
    vi.mocked(api.fetchProfile).mockResolvedValue(profile);
    vi.mocked(storage.getTokens).mockResolvedValue({
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      expiresAt: issued.expiresAt,
    });
    vi.mocked(storage.getProfile).mockResolvedValue(profile);

    await startAuthFlow();

    const authUrl = vi.mocked(browser.identity.launchWebAuthFlow).mock
      .calls[0]![0].url;
    expect(authUrl).toContain("/oauth/authorize");
    expect(api.exchangeCode).toHaveBeenCalledWith({
      baseUrl: expect.any(String),
      code: "auth-code",
      redirectUri: REDIRECT,
      codeVerifier: expect.any(String),
    });
    expect(storage.setTokens).toHaveBeenCalledWith(issued);
    expect(storage.setProfile).toHaveBeenCalledWith(profile);
    const message = vi
      .mocked(browser.runtime.sendMessage)
      .mock.calls.at(-1)![0];
    expect(message).toMatchObject({
      type: AUTH_MESSAGE_TYPES.authStateChanged,
      state: { status: "authenticated" },
    });
    // Surfaces the settings page so the closing OAuth window isn't a dead end.
    expect(browser.runtime.openOptionsPage).toHaveBeenCalled();
  });

  it("rejects a state mismatch as a CSRF failure and stores nothing", async () => {
    vi.mocked(browser.identity.launchWebAuthFlow).mockResolvedValue(
      `${REDIRECT}?code=auth-code&state=attacker-supplied`,
    );
    await expect(startAuthFlow()).rejects.toBeInstanceOf(AuthorizationFailed);
    expect(api.exchangeCode).not.toHaveBeenCalled();
    expect(storage.setTokens).not.toHaveBeenCalled();
    expect(browser.runtime.openOptionsPage).not.toHaveBeenCalled();
  });

  it("rejects when CTM returns an error parameter", async () => {
    vi.mocked(browser.identity.launchWebAuthFlow).mockResolvedValue(
      `${REDIRECT}?error=access_denied`,
    );
    await expect(startAuthFlow()).rejects.toBeInstanceOf(AuthorizationFailed);
    expect(api.exchangeCode).not.toHaveBeenCalled();
  });
});
