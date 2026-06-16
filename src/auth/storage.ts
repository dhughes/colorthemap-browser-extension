import browser from "webextension-polyfill";

const TOKENS_KEY = "ctm.auth.tokens";
const PROFILE_KEY = "ctm.auth.profile";

export interface Tokens {
  accessToken: string;
  refreshToken: string;
  // Epoch ms at which the access token expires.
  expiresAt: number;
}

export interface Profile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

export async function getTokens(): Promise<Tokens | null> {
  const result = await browser.storage.local.get(TOKENS_KEY);
  return (result[TOKENS_KEY] as Tokens | undefined) ?? null;
}

export async function setTokens(tokens: Tokens): Promise<void> {
  await browser.storage.local.set({ [TOKENS_KEY]: tokens });
}

export async function getProfile(): Promise<Profile | null> {
  const result = await browser.storage.local.get(PROFILE_KEY);
  return (result[PROFILE_KEY] as Profile | undefined) ?? null;
}

export async function setProfile(profile: Profile): Promise<void> {
  await browser.storage.local.set({ [PROFILE_KEY]: profile });
}

export async function clearAuth(): Promise<void> {
  await browser.storage.local.remove([TOKENS_KEY, PROFILE_KEY]);
}
