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
import { handleUploadMessage } from "./upload/handler";

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

// On browser launch, refresh up front so we don't declare "authenticated"
// with a token that's about to expire.
browser.runtime.onStartup.addListener(() => {
  void refreshIfNeeded();
});

// Auth and upload entry points converge here: surfaces post a typed message;
// the SW owns the flow. Each handler returns undefined for messages it doesn't
// own, so `??` falls through to the next.
browser.runtime.onMessage.addListener(
  (message: unknown) =>
    handleAuthMessage(message) ?? handleUploadMessage(message),
);

// The toolbar button has no popup — clicking it opens the settings page, the
// single hub for connecting and (later) per-site config.
browser.action.onClicked.addListener(() => {
  void browser.runtime.openOptionsPage();
});

// Alarm wiring is registered before the detection setup below so a throw in
// detector init can't prevent the periodic refresh from being scheduled.
registerAlarmListener();
registerRefreshAlarm();

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

// onStartup only fires on browser launch; an evicted MV3 SW re-spun by any
// event also needs the proactive check, so run it on every SW evaluation
// (single-flight in the service dedups any overlap with the alarm).
void refreshIfNeeded();
