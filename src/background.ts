import browser from "webextension-polyfill";
import { aliveMessage } from "./shared/alive";
import { onDetection, onSkip } from "./shared/bus";
import { createRecentDetections } from "./shared/dedupe";
import {
  createDetectionMessage,
  formatDetectionLog,
  formatSkipLog,
  type DetectionMessage,
  type SkipMessage,
} from "./shared/messages";
import { initDetectorB } from "./detectors/detector-b";

console.log(aliveMessage("background"));

const recent = createRecentDetections();

function handleDetection(message: DetectionMessage): void {
  if (recent.isDuplicate(message, Date.now())) {
    return;
  }
  console.log(formatDetectionLog(message));
}

function handleSkip(message: SkipMessage): void {
  console.log(formatSkipLog(message));
}

onDetection(handleDetection);
onSkip(handleSkip);
initDetectorB((payload) => handleDetection(createDetectionMessage(payload)));

browser.runtime.onInstalled.addListener((details) => {
  console.log(aliveMessage("background"), "onInstalled", details.reason);
});

browser.runtime.onStartup.addListener(() => {
  console.log(aliveMessage("background"), "onStartup");
});
