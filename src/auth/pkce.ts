function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function randomBase64Url(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

// 48 random bytes → exactly 64 base64url chars, within RFC 7636's 43–128 range.
export function generateCodeVerifier(): string {
  return randomBase64Url(48);
}

export async function computeCodeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

export async function generatePkcePair(): Promise<{
  verifier: string;
  challenge: string;
}> {
  const verifier = generateCodeVerifier();
  const challenge = await computeCodeChallenge(verifier);
  return { verifier, challenge };
}

// Per-flow CSRF guard echoed back on the redirect and verified on return.
export function generateState(): string {
  return randomBase64Url(16);
}
