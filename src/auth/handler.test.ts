import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  authStateChanged,
  getAuthStateMessage,
  logoutMessage,
  startAuthMessage,
} from "./messages";
import * as service from "./service";
import { handleAuthMessage } from "./handler";

vi.mock("./service", () => ({
  startAuthFlow: vi.fn(async () => undefined),
  logout: vi.fn(async () => undefined),
  getAuthState: vi.fn(async () => ({ status: "unauthenticated" })),
}));

beforeEach(() => vi.clearAllMocks());

describe("handleAuthMessage", () => {
  it("starts the auth flow for a start-auth message, opening options by default", () => {
    handleAuthMessage(startAuthMessage());
    expect(service.startAuthFlow).toHaveBeenCalledTimes(1);
    expect(service.startAuthFlow).toHaveBeenCalledWith({ openOptions: true });
  });

  it("forwards openOptions:false so a toast-initiated login stays in place", () => {
    handleAuthMessage(startAuthMessage({ openOptions: false }));
    expect(service.startAuthFlow).toHaveBeenCalledWith({ openOptions: false });
  });

  it("logs out for a logout message", () => {
    handleAuthMessage(logoutMessage());
    expect(service.logout).toHaveBeenCalledTimes(1);
  });

  it("answers a get-auth-state query with the current state", async () => {
    const result = await handleAuthMessage(getAuthStateMessage());
    expect(service.getAuthState).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ status: "unauthenticated" });
  });

  it("ignores the outbound state-changed broadcast", () => {
    expect(
      handleAuthMessage(authStateChanged({ status: "unauthenticated" })),
    ).toBeUndefined();
  });

  it("returns undefined for foreign messages so other listeners can handle them", () => {
    expect(handleAuthMessage({ type: "not-ours" })).toBeUndefined();
    expect(handleAuthMessage(undefined)).toBeUndefined();
    expect(service.startAuthFlow).not.toHaveBeenCalled();
  });
});
