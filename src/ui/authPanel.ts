import browser from "webextension-polyfill";
import { CTM_BASE_URL } from "../auth/config";
import {
  AUTH_MESSAGE_TYPES,
  getAuthStateMessage,
  isAuthMessage,
  logoutMessage,
  startAuthMessage,
  type AuthState,
} from "../auth/messages";

// Where users without an account go. Opened in a new tab from the signup link.
export const CTM_SIGNUP_URL = `${CTM_BASE_URL}/signup`;

export interface AuthView {
  authenticated: boolean;
  email: string | null;
  avatarUrl: string | null;
}

export function toAuthView(state: AuthState): AuthView {
  if (state.status === "authenticated") {
    return {
      authenticated: true,
      email: state.profile.email,
      avatarUrl: avatarSrc(state.profile.avatarUrl),
    };
  }
  return { authenticated: false, email: null, avatarUrl: null };
}

// CTM returns avatar_url as a path relative to its origin; make it absolute
// so an extension page can load it.
export function avatarSrc(avatarUrl: string | null): string | null {
  return avatarUrl ? `${CTM_BASE_URL}${avatarUrl}` : null;
}

// Render the current state immediately, then re-render on every broadcast from
// the background SW (login, logout, refresh failure).
const LOGGED_OUT: AuthView = {
  authenticated: false,
  email: null,
  avatarUrl: null,
};

export function connectAuthPanel(render: (view: AuthView) => void): void {
  void browser.runtime
    .sendMessage(getAuthStateMessage())
    .then((state) =>
      render(state ? toAuthView(state as AuthState) : LOGGED_OUT),
    )
    // Never leave the surface blank: if the SW is unreachable, show logged-out.
    .catch(() => render(LOGGED_OUT));

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (
      isAuthMessage(message) &&
      message.type === AUTH_MESSAGE_TYPES.authStateChanged
    ) {
      render(toAuthView(message.state));
    }
  });
}

export function requestConnect(): Promise<unknown> {
  return browser.runtime.sendMessage(startAuthMessage());
}

export function requestDisconnect(): Promise<unknown> {
  return browser.runtime.sendMessage(logoutMessage());
}
