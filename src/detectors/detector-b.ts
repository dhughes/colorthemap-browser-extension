import browser from "webextension-polyfill";
import { classifyByMetadata } from "../shared/classify";
import { filenameFromUrl } from "../shared/detection-url";
import type { GpsFormat } from "../shared/formats";

export interface DownloadDetection {
  format: GpsFormat;
  url: string;
  filename: string;
}

// Detector B watches the browser's own download stream — the only detector that
// catches navigation/anchor downloads (e.g. MapMyFitness's "Download GPX", a
// top-level navigation to a URL whose format is a query param). Uses
// downloads.onCreated, which is cross-browser (Chrome, Edge, Firefox), unlike
// onDeterminingFilename (Chromium-only). Safari has no downloads API at all.
export function initDetectorB(
  report: (detection: DownloadDetection) => void,
): boolean {
  const event = browser.downloads?.onCreated;
  if (!event) {
    return false;
  }

  event.addListener((item) => {
    const url = item.url ?? "";
    // Skip blob:/data: downloads — those originate from page JS (fetch → blob),
    // which Detector A already intercepts, and their URLs can't be re-fetched.
    if (!/^https?:/i.test(url)) {
      return;
    }

    const format = classifyByMetadata({
      url,
      filename: item.filename,
      contentType: item.mime,
    });
    if (!format) {
      return;
    }

    report({
      format,
      url,
      filename: downloadFilename(item.filename, url, format),
    });
  });

  return true;
}

// onCreated's filename is a local path (Firefox) or may be empty (Chrome). Prefer
// its basename, else synthesize one from the URL.
function downloadFilename(
  itemFilename: string,
  url: string,
  format: GpsFormat,
): string {
  const base = itemFilename ? (itemFilename.split(/[\\/]/).pop() ?? "") : "";
  return base.includes(".") ? base : filenameFromUrl(url, format);
}
