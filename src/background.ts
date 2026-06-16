import browser from "webextension-polyfill";
import { aliveMessage } from "./shared/alive";
import { onDetection } from "./shared/bus";
import { createRecentDetections } from "./shared/dedupe";
import {
  createDetectionMessage,
  formatDetectionLog,
  type DetectionMessage,
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

onDetection(handleDetection);
initDetectorB((payload) => handleDetection(createDetectionMessage(payload)));

browser.runtime.onInstalled.addListener((details) => {
  console.log(aliveMessage("background"), "onInstalled", details.reason);
});

browser.runtime.onStartup.addListener(() => {
  console.log(aliveMessage("background"), "onStartup");
});
