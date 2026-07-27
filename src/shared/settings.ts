import browser from "webextension-polyfill";

const ALLOW_PRIVATE_HOSTS_KEY = "ctm.security.allowPrivateHosts";

// The buried "dangerous features" opt-in: when true, the re-fetch guard
// (`isSafeRefetchTarget`) permits loopback/private hosts — for local dev testing
// and rare self-hosted sources. Defaults off; a normal install never sets it.
export async function getAllowPrivateHosts(): Promise<boolean> {
  const result = await browser.storage.local.get(ALLOW_PRIVATE_HOSTS_KEY);
  return result[ALLOW_PRIVATE_HOSTS_KEY] === true;
}

export async function setAllowPrivateHosts(value: boolean): Promise<void> {
  await browser.storage.local.set({ [ALLOW_PRIVATE_HOSTS_KEY]: value });
}
