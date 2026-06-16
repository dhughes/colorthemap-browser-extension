import { sendDetection } from "../shared/bus";
import { isDetectionEnabledForHost } from "../shared/gate";
import { isDetectorAMessage } from "./detector-a-protocol";

export function initDetectorABridge(): void {
  window.addEventListener("message", (event) => {
    // Only trust messages from this same window/origin — the main-world wrap
    // posts with targetOrigin = our own origin. (file:// pages report "null"
    // for both, so the comparison still holds.)
    if (event.source !== window || event.origin !== location.origin) {
      return;
    }
    if (!isDetectorAMessage(event.data)) {
      return;
    }
    if (!isDetectionEnabledForHost(location.hostname)) {
      return;
    }
    void sendDetection({
      detector: "A",
      format: event.data.format,
      source: event.data.via,
      url: event.data.url,
    });
  });
}
