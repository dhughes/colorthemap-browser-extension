import { sendDetection } from "../shared/bus";
import { isDetectionEnabledForHost } from "../shared/gate";
import { isDetectorAMessage } from "./detector-a-protocol";

export function initDetectorABridge(): void {
  window.addEventListener("message", (event) => {
    if (event.source !== window) {
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
