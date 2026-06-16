import browser from "webextension-polyfill";
import {
  createDetectionMessage,
  isDetectionMessage,
  type DetectionMessage,
  type DetectionPayload,
} from "./messages";

export async function sendDetection(payload: DetectionPayload): Promise<void> {
  try {
    await browser.runtime.sendMessage(createDetectionMessage(payload));
  } catch {
    // Best-effort logging pipeline: a missing receiver (SW asleep, message
    // ignored) must never throw into the page or a detector.
  }
}

export function onDetection(
  handler: (message: DetectionMessage) => void,
): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isDetectionMessage(message)) {
      handler(message);
    }
  });
}
