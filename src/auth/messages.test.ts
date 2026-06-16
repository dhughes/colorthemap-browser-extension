import { describe, expect, it } from "vitest";
import {
  AUTH_MESSAGE_TYPES,
  authStateChanged,
  getAuthState,
  isAuthMessage,
  logout,
  startAuth,
  type AuthState,
} from "./messages";

describe("auth message creators", () => {
  it("stamp the correct discriminator type", () => {
    expect(startAuth().type).toBe(AUTH_MESSAGE_TYPES.startAuth);
    expect(logout().type).toBe(AUTH_MESSAGE_TYPES.logout);
    expect(getAuthState().type).toBe(AUTH_MESSAGE_TYPES.getAuthState);
  });

  it("carries the auth state on a state-changed broadcast", () => {
    const state: AuthState = { status: "unauthenticated" };
    const message = authStateChanged(state);
    expect(message.type).toBe(AUTH_MESSAGE_TYPES.authStateChanged);
    expect(message.state).toEqual(state);
  });
});

describe("isAuthMessage", () => {
  it("accepts every known auth message", () => {
    expect(isAuthMessage(startAuth())).toBe(true);
    expect(isAuthMessage(logout())).toBe(true);
    expect(isAuthMessage(getAuthState())).toBe(true);
    expect(isAuthMessage(authStateChanged({ status: "unauthenticated" }))).toBe(
      true,
    );
  });

  it("rejects foreign or malformed messages", () => {
    expect(isAuthMessage(undefined)).toBe(false);
    expect(isAuthMessage(null)).toBe(false);
    expect(isAuthMessage("ctm:start-auth")).toBe(false);
    expect(isAuthMessage({})).toBe(false);
    expect(isAuthMessage({ type: 42 })).toBe(false);
    expect(isAuthMessage({ type: "some-other-extension-message" })).toBe(false);
  });
});
