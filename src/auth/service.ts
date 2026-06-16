import browser from "webextension-polyfill";
import { authStateChanged, type AuthState } from "./messages";
import * as api from "./api";
import type { TokenSet } from "./api";
import { CTM_BASE_URL, REFRESH_THRESHOLD_MS } from "./config";
import { AuthorizationFailed, TokenExpired } from "./errors";
import { generatePkcePair, generateState } from "./pkce";
import * as storage from "./storage";
import type { Tokens } from "./storage";

export function needsRefresh(
  tokens: Tokens,
  now: number = Date.now(),
): boolean {
  return tokens.expiresAt - now <= REFRESH_THRESHOLD_MS;
}

export async function getAuthState(): Promise<AuthState> {
  const [tokens, profile] = await Promise.all([
    storage.getTokens(),
    storage.getProfile(),
  ]);
  if (tokens && profile) return { status: "authenticated", profile };
  return { status: "unauthenticated" };
}

export async function isAuthenticated(): Promise<boolean> {
  return (await getAuthState()).status === "authenticated";
}

export async function broadcastAuthState(): Promise<void> {
  const state = await getAuthState();
  try {
    await browser.runtime.sendMessage(authStateChanged(state));
  } catch {
    // No surface is listening (no open popup / options / content script).
    // sendMessage rejects in that case — expected, not an error.
  }
}

// Concurrent callers share one in-flight refresh: MV3's single background SW
// plus this guard makes the duplicate-refresh race impossible.
let refreshInFlight: Promise<TokenSet> | null = null;

// The single entry point for a valid access token: fresh from cache, a
// transparent refresh, or TokenExpired for the caller to surface as
// "please sign in again".
export async function getAccessToken(): Promise<string> {
  const tokens = await storage.getTokens();
  if (!tokens) throw new TokenExpired("Not signed in");
  if (!needsRefresh(tokens)) return tokens.accessToken;
  const refreshed = await runRefresh(tokens);
  return refreshed.accessToken;
}

// Proactive refresh used by the periodic alarm and at SW startup. Swallows
// failure — doRefresh has already wiped state and broadcast logged-out.
export async function refreshIfNeeded(): Promise<void> {
  const tokens = await storage.getTokens();
  if (!tokens || !needsRefresh(tokens)) return;
  try {
    await runRefresh(tokens);
  } catch {
    // Already handled by doRefresh.
  }
}

function runRefresh(tokens: Tokens): Promise<TokenSet> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefresh(tokens).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function doRefresh(tokens: Tokens): Promise<TokenSet> {
  let next: TokenSet;
  try {
    next = await api.refreshTokens({
      baseUrl: CTM_BASE_URL,
      refreshToken: tokens.refreshToken,
    });
  } catch (cause) {
    // Refresh rejected (rotated/expired/revoked). Wipe and tell every surface
    // to show logged-out. Do not auto-reopen OAuth.
    await storage.clearAuth();
    await broadcastAuthState();
    throw new TokenExpired("Your session has expired", { cause });
  }
  await storage.setTokens(next);
  return next;
}

export async function startAuthFlow(): Promise<void> {
  const redirectUri = browser.identity.getRedirectURL();
  const { verifier, challenge } = await generatePkcePair();
  const state = generateState();

  const authUrl = api.buildAuthorizeUrl({
    baseUrl: CTM_BASE_URL,
    redirectUri,
    codeChallenge: challenge,
    state,
  });

  const redirectResult = await browser.identity.launchWebAuthFlow({
    url: authUrl,
    interactive: true,
  });
  if (!redirectResult) {
    throw new AuthorizationFailed("Authorization window closed");
  }

  const callback = new URL(redirectResult);
  const error = callback.searchParams.get("error");
  if (error) throw new AuthorizationFailed(`Authorization denied: ${error}`);

  const code = callback.searchParams.get("code");
  if (!code) throw new AuthorizationFailed("No authorization code returned");

  if (callback.searchParams.get("state") !== state) {
    throw new AuthorizationFailed("State mismatch — possible CSRF");
  }

  // redirectUri must be byte-identical to the authorize-time value — CTM's
  // /oauth/token requires an exact match (RFC 6749 §4.1.3).
  const tokens = await api.exchangeCode({
    baseUrl: CTM_BASE_URL,
    code,
    redirectUri,
    codeVerifier: verifier,
  });
  await storage.setTokens(tokens);

  const profile = await api.fetchProfile({
    baseUrl: CTM_BASE_URL,
    accessToken: tokens.accessToken,
  });
  await storage.setProfile(profile);

  await broadcastAuthState();

  // The OAuth window just closed with no other signal. Bring the settings page
  // forward (focuses the existing tab, or opens one) so the user lands on their
  // now-connected state instead of wondering whether anything happened.
  await browser.runtime.openOptionsPage();
}

export async function logout(): Promise<void> {
  // CTM #799 exposes no OAuth token-revocation endpoint, so logout is local:
  // wipe tokens + profile. The user clicked disconnect — never leave stale
  // state, even if a future server call were to fail.
  await storage.clearAuth();
  await broadcastAuthState();
}
