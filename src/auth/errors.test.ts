import { describe, expect, it } from "vitest";
import {
  AuthError,
  AuthorizationFailed,
  NetworkError,
  ServerError,
  TokenExpired,
} from "./errors";

describe("auth errors", () => {
  it("are all instances of the AuthError base and Error", () => {
    const errors = [
      new AuthorizationFailed("denied"),
      new NetworkError("offline"),
      new ServerError(500, "boom"),
      new TokenExpired("refresh rejected"),
    ];
    for (const err of errors) {
      expect(err).toBeInstanceOf(AuthError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it("carry their class name so handlers can branch on it", () => {
    expect(new AuthorizationFailed("x").name).toBe("AuthorizationFailed");
    expect(new NetworkError("x").name).toBe("NetworkError");
    expect(new ServerError(400, "x").name).toBe("ServerError");
    expect(new TokenExpired("x").name).toBe("TokenExpired");
  });

  it("preserve the message and an optional cause", () => {
    const cause = new Error("root");
    const err = new NetworkError("offline", { cause });
    expect(err.message).toBe("offline");
    expect(err.cause).toBe(cause);
  });

  it("exposes the HTTP status on ServerError", () => {
    expect(new ServerError(503, "unavailable").status).toBe(503);
  });

  it("can be discriminated by instanceof for distinct handling", () => {
    const err: AuthError = new TokenExpired("expired");
    expect(err instanceof TokenExpired).toBe(true);
    expect(err instanceof AuthorizationFailed).toBe(false);
  });
});
