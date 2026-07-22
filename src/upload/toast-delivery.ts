import browser from "webextension-polyfill";
import type { DownloadDetection } from "../detectors/detector-b";
import { openToastMessage } from "./messages";

// Detector B fires the moment a download starts — which, for a target="_blank"
// link, is while the browser's short-lived download tab is still the active
// tab. That tab has no content script, so a single active-tab send lands
// nowhere and the toast never appears. The tab closes itself within ~a second
// and the initiating page becomes active again, so a couple of spaced retries
// reach it reliably.
export const TOAST_DELIVERY_DELAYS_MS = [0, 400, 1200];

// The polyfill rejects with "message port closed" when the listener received
// the message but didn't respond — the content script's toast listener is
// fire-and-forget, so that rejection IS a successful delivery. Only "no
// receiver in that tab" (or no tab at all) is worth retrying.
export function isDeliveredOutcome(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return !/receiving end does not exist/i.test(message);
}

async function sendToastToActiveTab(
  detection: DownloadDetection,
): Promise<boolean> {
  const [tab] = await browser.tabs.query({
    active: true,
    currentWindow: true,
  });
  if (tab?.id == null) {
    return false;
  }
  try {
    await browser.tabs.sendMessage(tab.id, openToastMessage(detection));
    return true;
  } catch (error) {
    return isDeliveredOutcome(error);
  }
}

export async function deliverDownloadToast(
  detection: DownloadDetection,
  sleep: (ms: number) => Promise<void> = (ms) =>
    new Promise((resolve) => setTimeout(resolve, ms)),
): Promise<boolean> {
  for (const delay of TOAST_DELIVERY_DELAYS_MS) {
    if (delay > 0) {
      await sleep(delay);
    }
    try {
      if (await sendToastToActiveTab(detection)) {
        return true;
      }
    } catch {
      // tabs.query itself failed — treat like a missed attempt and retry.
    }
  }
  return false;
}
