import browser from "webextension-polyfill";

const KEY = "ctm.upload.lastMapByHost";

// Remembers the last map chosen for each source site, so returning to a site
// pre-selects what you used there last; a brand-new site falls back to the first
// map. Keyed by the page's hostname.
type LastMapByHost = Record<string, number>;

async function read(): Promise<LastMapByHost> {
  const result = await browser.storage.local.get(KEY);
  return (result[KEY] as LastMapByHost | undefined) ?? {};
}

export async function getLastMapForHost(host: string): Promise<number | null> {
  const id = (await read())[host];
  return typeof id === "number" ? id : null;
}

export async function setLastMapForHost(
  host: string,
  mapId: number,
): Promise<void> {
  const byHost = await read();
  byHost[host] = mapId;
  await browser.storage.local.set({ [KEY]: byHost });
}
