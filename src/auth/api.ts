import { CLIENT_ID, SCOPE } from "./config";
import { AuthorizationFailed, NetworkError, ServerError } from "./errors";
import type { Profile } from "./storage";

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  // Epoch ms at which the access token expires.
  expiresAt: number;
  scope: string;
}

interface TokenResponseBody {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

interface MeResponseBody {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  avatar_url: string | null;
}

export function buildAuthorizeUrl(params: {
  baseUrl: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const query = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: params.redirectUri,
    code_challenge: params.codeChallenge,
    code_challenge_method: "S256",
    scope: SCOPE,
    state: params.state,
  });
  return `${params.baseUrl}/oauth/authorize?${query.toString()}`;
}

async function postToken(
  baseUrl: string,
  form: URLSearchParams,
): Promise<TokenSet> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
  } catch (cause) {
    throw new NetworkError("Could not reach Color The Map", { cause });
  }

  if (!response.ok) {
    throw await httpError(response);
  }

  const body = (await response.json()) as TokenResponseBody;
  return {
    accessToken: body.access_token,
    refreshToken: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
    scope: body.scope,
  };
}

export function exchangeCode(params: {
  baseUrl: string;
  code: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<TokenSet> {
  return postToken(
    params.baseUrl,
    new URLSearchParams({
      grant_type: "authorization_code",
      code: params.code,
      redirect_uri: params.redirectUri,
      client_id: CLIENT_ID,
      code_verifier: params.codeVerifier,
    }),
  );
}

export function refreshTokens(params: {
  baseUrl: string;
  refreshToken: string;
}): Promise<TokenSet> {
  return postToken(
    params.baseUrl,
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: params.refreshToken,
      client_id: CLIENT_ID,
    }),
  );
}

export async function fetchProfile(params: {
  baseUrl: string;
  accessToken: string;
}): Promise<Profile> {
  let response: Response;
  try {
    response = await fetch(`${params.baseUrl}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${params.accessToken}` },
    });
  } catch (cause) {
    throw new NetworkError("Could not reach Color The Map", { cause });
  }

  if (!response.ok) {
    throw await httpError(response);
  }

  const body = (await response.json()) as MeResponseBody;
  return {
    id: body.id,
    email: body.email,
    firstName: body.first_name,
    lastName: body.last_name,
    avatarUrl: body.avatar_url,
  };
}

// 5xx is the server's fault (retryable); 4xx is the request/grant's fault
// (the flow must restart). The body shape is RFC 6749 §5.2 ({error, ...}) for
// the token endpoint and {detail} for the JSON API — read it best-effort.
async function httpError(
  response: Response,
): Promise<ServerError | AuthorizationFailed> {
  const detail = await readErrorDetail(response);
  if (response.status >= 500) {
    return new ServerError(response.status, detail);
  }
  return new AuthorizationFailed(detail);
}

async function readErrorDetail(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Record<string, unknown>;
    const detail =
      body.error_description ??
      body.error ??
      body.detail ??
      response.statusText;
    return String(detail);
  } catch {
    return response.statusText || `HTTP ${response.status}`;
  }
}
