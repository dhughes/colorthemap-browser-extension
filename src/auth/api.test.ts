import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthorizeUrl,
  exchangeCode,
  fetchProfile,
  refreshTokens,
} from "./api";
import { AuthorizationFailed, NetworkError } from "./errors";

const BASE = "https://dev.colorthemap.app";
const REDIRECT = "https://abc.chromiumapp.org/cb";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const tokenBody = {
  access_token: "access-xyz",
  refresh_token: "refresh-xyz",
  token_type: "bearer",
  expires_in: 3600,
  scope: "ctm:full",
};

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => vi.unstubAllGlobals());

describe("buildAuthorizeUrl", () => {
  it("targets CTM's authorize route with the PKCE + CSRF query params", () => {
    const url = new URL(
      buildAuthorizeUrl({
        baseUrl: BASE,
        redirectUri: REDIRECT,
        codeChallenge: "challenge-abc",
        state: "state-123",
      }),
    );
    expect(url.origin + url.pathname).toBe(`${BASE}/oauth/authorize`);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("ctm-browser-extension");
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("code_challenge")).toBe("challenge-abc");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toBe("ctm:full");
    expect(url.searchParams.get("state")).toBe("state-123");
  });
});

describe("exchangeCode", () => {
  it("POSTs a form-encoded authorization_code grant and normalizes the response", async () => {
    fetchMock.mockResolvedValue(jsonResponse(tokenBody));
    const before = Date.now();
    const tokens = await exchangeCode({
      baseUrl: BASE,
      code: "auth-code",
      redirectUri: REDIRECT,
      codeVerifier: "verifier-abc",
    });
    const after = Date.now();

    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/oauth/token`);
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe(
      "application/x-www-form-urlencoded",
    );
    const form = new URLSearchParams(init.body);
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("auth-code");
    expect(form.get("redirect_uri")).toBe(REDIRECT);
    expect(form.get("client_id")).toBe("ctm-browser-extension");
    expect(form.get("code_verifier")).toBe("verifier-abc");

    expect(tokens.accessToken).toBe("access-xyz");
    expect(tokens.refreshToken).toBe("refresh-xyz");
    expect(tokens.scope).toBe("ctm:full");
    expect(tokens.expiresAt).toBeGreaterThanOrEqual(before + 3600 * 1000);
    expect(tokens.expiresAt).toBeLessThanOrEqual(after + 3600 * 1000);
  });

  it("maps a 400 invalid_grant to AuthorizationFailed", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { error: "invalid_grant", error_description: "bad code" },
        400,
      ),
    );
    await expect(
      exchangeCode({
        baseUrl: BASE,
        code: "x",
        redirectUri: REDIRECT,
        codeVerifier: "v",
      }),
    ).rejects.toBeInstanceOf(AuthorizationFailed);
  });

  it("maps a 5xx to ServerError carrying the status", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "server_error" }, 503));
    await expect(
      exchangeCode({
        baseUrl: BASE,
        code: "x",
        redirectUri: REDIRECT,
        codeVerifier: "v",
      }),
    ).rejects.toMatchObject({ name: "ServerError", status: 503 });
  });

  it("maps a fetch rejection to NetworkError", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(
      exchangeCode({
        baseUrl: BASE,
        code: "x",
        redirectUri: REDIRECT,
        codeVerifier: "v",
      }),
    ).rejects.toBeInstanceOf(NetworkError);
  });
});

describe("refreshTokens", () => {
  it("POSTs a refresh_token grant with the client id", async () => {
    fetchMock.mockResolvedValue(jsonResponse(tokenBody));
    const tokens = await refreshTokens({
      baseUrl: BASE,
      refreshToken: "old-refresh",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/oauth/token`);
    const form = new URLSearchParams(init.body);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("old-refresh");
    expect(form.get("client_id")).toBe("ctm-browser-extension");
    expect(tokens.accessToken).toBe("access-xyz");
    expect(tokens.refreshToken).toBe("refresh-xyz");
  });

  it("maps a rejected refresh token to AuthorizationFailed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: "invalid_grant" }, 400));
    await expect(
      refreshTokens({ baseUrl: BASE, refreshToken: "stale" }),
    ).rejects.toBeInstanceOf(AuthorizationFailed);
  });
});

describe("fetchProfile", () => {
  it("GETs /api/v1/auth/me with a bearer token and camel-cases the result", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: "user-1",
        email: "doug@example.com",
        first_name: "Doug",
        last_name: "Hughes",
        avatar_url: "/api/v1/auth/avatar/user-1?v=9",
      }),
    );
    const profile = await fetchProfile({
      baseUrl: BASE,
      accessToken: "access-xyz",
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${BASE}/api/v1/auth/me`);
    expect(init.headers.Authorization).toBe("Bearer access-xyz");
    expect(profile).toEqual({
      id: "user-1",
      email: "doug@example.com",
      firstName: "Doug",
      lastName: "Hughes",
      avatarUrl: "/api/v1/auth/avatar/user-1?v=9",
    });
  });

  it("tolerates a null avatar_url", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        id: "u",
        email: "e@e.com",
        first_name: "A",
        last_name: "B",
        avatar_url: null,
      }),
    );
    const profile = await fetchProfile({ baseUrl: BASE, accessToken: "t" });
    expect(profile.avatarUrl).toBeNull();
  });

  it("maps a 401 to AuthorizationFailed", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: "unauthorized" }, 401));
    await expect(
      fetchProfile({ baseUrl: BASE, accessToken: "bad" }),
    ).rejects.toBeInstanceOf(AuthorizationFailed);
  });
});
