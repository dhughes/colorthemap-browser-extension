import { describe, expect, it, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    runtime: { sendMessage: vi.fn(), onMessage: { addListener: vi.fn() } },
  },
}));

import { avatarSrc, toAuthView } from "./authPanel";
import type { AuthState } from "../auth/messages";

describe("toAuthView", () => {
  it("maps an authenticated state to email + absolute avatar", () => {
    const state: AuthState = {
      status: "authenticated",
      profile: {
        id: "u",
        email: "doug@example.com",
        firstName: "Doug",
        lastName: "Hughes",
        avatarUrl: "/api/v1/auth/avatar/u?v=1",
      },
    };
    expect(toAuthView(state)).toEqual({
      authenticated: true,
      email: "doug@example.com",
      avatarUrl: "https://dev.colorthemap.app/api/v1/auth/avatar/u?v=1",
    });
  });

  it("maps an unauthenticated state to an empty view", () => {
    expect(toAuthView({ status: "unauthenticated" })).toEqual({
      authenticated: false,
      email: null,
      avatarUrl: null,
    });
  });

  it("keeps a null avatar null rather than building a bare-origin URL", () => {
    const state: AuthState = {
      status: "authenticated",
      profile: {
        id: "u",
        email: "e@e.com",
        firstName: "A",
        lastName: "B",
        avatarUrl: null,
      },
    };
    expect(toAuthView(state).avatarUrl).toBeNull();
  });
});

describe("avatarSrc", () => {
  it("absolutizes a relative avatar path against the CTM origin", () => {
    expect(avatarSrc("/api/v1/auth/avatar/u")).toBe(
      "https://dev.colorthemap.app/api/v1/auth/avatar/u",
    );
  });

  it("returns null for a missing avatar", () => {
    expect(avatarSrc(null)).toBeNull();
  });
});
