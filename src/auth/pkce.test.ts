import { describe, expect, it } from "vitest";
import {
  computeCodeChallenge,
  generateCodeVerifier,
  generatePkcePair,
  generateState,
} from "./pkce";

// CTM accepts S256 only and validates the challenge against
// ^[A-Za-z0-9_-]{43}$ (base64url-no-pad of 32 bytes) — backend/auth/oauth_clients.py.
const CHALLENGE_RE = /^[A-Za-z0-9_-]{43}$/;
// RFC 7636 §4.1: code_verifier is the unreserved set, 43–128 chars.
const VERIFIER_RE = /^[A-Za-z0-9\-._~]{43,128}$/;

describe("generateCodeVerifier", () => {
  it("returns a 64-char verifier from the unreserved alphabet", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toHaveLength(64);
    expect(verifier).toMatch(VERIFIER_RE);
  });

  it("is unguessable — successive verifiers differ", () => {
    expect(generateCodeVerifier()).not.toBe(generateCodeVerifier());
  });
});

describe("computeCodeChallenge", () => {
  it("matches the RFC 7636 Appendix B known-answer vector", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    const challenge = await computeCodeChallenge(verifier);
    expect(challenge).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("produces a challenge CTM's S256 validator will accept", async () => {
    const challenge = await computeCodeChallenge(generateCodeVerifier());
    expect(challenge).toMatch(CHALLENGE_RE);
  });

  it("is deterministic for a given verifier", async () => {
    const verifier = generateCodeVerifier();
    expect(await computeCodeChallenge(verifier)).toBe(
      await computeCodeChallenge(verifier),
    );
  });
});

describe("generatePkcePair", () => {
  it("returns a verifier and its matching challenge", async () => {
    const { verifier, challenge } = await generatePkcePair();
    expect(verifier).toMatch(VERIFIER_RE);
    expect(challenge).toBe(await computeCodeChallenge(verifier));
  });
});

describe("generateState", () => {
  it("returns a non-empty unguessable CSRF token", () => {
    expect(generateState()).not.toBe(generateState());
    expect(generateState().length).toBeGreaterThanOrEqual(16);
  });
});
