import browser from "webextension-polyfill";
import { registerAlarmListener, registerRefreshAlarm } from "./auth/alarms";
import { handleAuthMessage } from "./auth/handler";
import { refreshIfNeeded } from "./auth/service";
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

// Register every event listener synchronously and first, before any call that
// could throw — an MV3/event-page background must have its listeners attached
// during initial evaluation or it misses startup-time events (onInstalled).

browser.runtime.onInstalled.addListener((details) => {
  console.log(aliveMessage("background"), "onInstalled", details.reason);
  if (details.reason === "install") {
    // Greet first-time users on the options page. It shows the welcome +
    // Connect CTA whenever logged out, so no special parameter is needed.
    browser.runtime
      .openOptionsPage()
      .catch((err) => console.error("could not open options page", err));
  }
});

// On SW boot, refresh up front so we don't declare "authenticated" with a
// token that's about to expire.
browser.runtime.onStartup.addListener(() => {
  void refreshIfNeeded();
});

// Auth entry points (install, options, detector surfaces) converge here:
// surfaces post a typed message; the SW owns the flow.
browser.runtime.onMessage.addListener((message: unknown) =>
  handleAuthMessage(message),
);

// The toolbar button has no popup — clicking it opens the settings page, the
// single hub for connecting and (later) per-site config.
browser.action.onClicked.addListener(() => {
  void browser.runtime.openOptionsPage();
});

// GPS-download detection (#4): every detector funnels into one deduped log.
const recent = createRecentDetections();

function handleDetection(message: DetectionMessage): void {
  if (recent.isDuplicate(message, Date.now())) {
    return;
  }
  console.log(formatDetectionLog(message));
}

onDetection(handleDetection);
initDetectorB((payload) => handleDetection(createDetectionMessage(payload)));

registerAlarmListener();

// Periodic proactive refresh so a long-open session never silently expires.
registerRefreshAlarm();
