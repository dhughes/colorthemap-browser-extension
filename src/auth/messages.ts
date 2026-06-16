import type { Profile } from "./storage";

export type AuthState =
  | { status: "authenticated"; profile: Profile }
  | { status: "unauthenticated" };

export const AUTH_MESSAGE_TYPES = {
  startAuth: "ctm:start-auth",
  logout: "ctm:logout",
  getAuthState: "ctm:get-auth-state",
  authStateChanged: "ctm:auth-state-changed",
} as const;

// Surface → background SW requests.
export interface StartAuthMessage {
  type: typeof AUTH_MESSAGE_TYPES.startAuth;
}
export interface LogoutMessage {
  type: typeof AUTH_MESSAGE_TYPES.logout;
}
export interface GetAuthStateMessage {
  type: typeof AUTH_MESSAGE_TYPES.getAuthState;
}

// Background SW → all surfaces broadcast.
export interface AuthStateChangedMessage {
  type: typeof AUTH_MESSAGE_TYPES.authStateChanged;
  state: AuthState;
}

export type AuthMessage =
  | StartAuthMessage
  | LogoutMessage
  | GetAuthStateMessage
  | AuthStateChangedMessage;

const KNOWN_TYPES: ReadonlySet<string> = new Set(
  Object.values(AUTH_MESSAGE_TYPES),
);

export function isAuthMessage(value: unknown): value is AuthMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    typeof (value as { type: unknown }).type === "string" &&
    KNOWN_TYPES.has((value as { type: string }).type)
  );
}

export const startAuth = (): StartAuthMessage => ({
  type: AUTH_MESSAGE_TYPES.startAuth,
});
export const logout = (): LogoutMessage => ({
  type: AUTH_MESSAGE_TYPES.logout,
});
export const getAuthState = (): GetAuthStateMessage => ({
  type: AUTH_MESSAGE_TYPES.getAuthState,
});
export const authStateChanged = (
  state: AuthState,
): AuthStateChangedMessage => ({
  type: AUTH_MESSAGE_TYPES.authStateChanged,
  state,
});
