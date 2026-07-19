import { describe, expect, it } from "vitest";
import {
  AUTH_MESSAGE_TYPES,
  authStateChanged,
  getAuthStateMessage,
  isAuthMessage,
  logoutMessage,
  startAuthMessage,
  type AuthState,
} from "./messages";

describe("auth message creators", () => {
  it("stamp the correct discriminator type", () => {
    expect(startAuthMessage().type).toBe(AUTH_MESSAGE_TYPES.startAuth);
    expect(logoutMessage().type).toBe(AUTH_MESSAGE_TYPES.logout);
    expect(getAuthStateMessage().type).toBe(AUTH_MESSAGE_TYPES.getAuthState);
  });

  it("carries the auth state on a state-changed broadcast", () => {
    const state: AuthState = { status: "unauthenticated" };
    const message = authStateChanged(state);
    expect(message.type).toBe(AUTH_MESSAGE_TYPES.authStateChanged);
    expect(message.state).toEqual(state);
  });

  it("carries openOptions on a start-auth message only when set", () => {
    expect(startAuthMessage().openOptions).toBeUndefined();
    expect(startAuthMessage({ openOptions: false }).openOptions).toBe(false);
  });
});

describe("isAuthMessage", () => {
  it("accepts every known auth message", () => {
    expect(isAuthMessage(startAuthMessage())).toBe(true);
    expect(isAuthMessage(logoutMessage())).toBe(true);
    expect(isAuthMessage(getAuthStateMessage())).toBe(true);
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
