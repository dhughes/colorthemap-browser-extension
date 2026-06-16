import browser from "webextension-polyfill";
import {
  createDetectionMessage,
  createSkipMessage,
  isDetectionMessage,
  isSkipMessage,
  type DetectionMessage,
  type DetectionPayload,
  type SkipMessage,
  type SkipPayload,
} from "./messages";

export async function sendDetection(payload: DetectionPayload): Promise<void> {
  try {
    await browser.runtime.sendMessage(createDetectionMessage(payload));
  } catch {
    // Best-effort logging pipeline: a missing receiver (SW asleep, message
    // ignored) must never throw into the page or a detector.
  }
}

export async function sendSkip(payload: SkipPayload): Promise<void> {
  try {
    await browser.runtime.sendMessage(createSkipMessage(payload));
  } catch {
    // Best-effort, as with sendDetection.
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

export function onSkip(handler: (message: SkipMessage) => void): void {
  browser.runtime.onMessage.addListener((message: unknown) => {
    if (isSkipMessage(message)) {
      handler(message);
    }
  });
}
