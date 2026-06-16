import { classifyByMetadata } from "../shared/classify";
import type { DetectionPayload } from "../shared/messages";

export function initDetectorB(
  report: (payload: DetectionPayload) => void,
): boolean {
  const event = chrome.downloads?.onDeterminingFilename;
  if (!event) {
    // Firefox never implemented onDeterminingFilename; Safari has no downloads
    // API at all. Both skip Detector B silently.
    return false;
  }

  event.addListener((item, suggest) => {
    try {
      const url = item.finalUrl || item.url || "";
      const format = classifyByMetadata({
        url,
        filename: item.filename,
        contentType: item.mime,
      });
      if (format) {
        report({
          detector: "B",
          format,
          source: "download",
          url,
          sizeHint: item.fileSize > 0 ? item.fileSize : undefined,
        });
      }
    } finally {
      suggest();
    }
  });

  return true;
}
