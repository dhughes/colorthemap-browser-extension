import browser from "webextension-polyfill";
import { REFRESH_ALARM_NAME, REFRESH_ALARM_PERIOD_MINUTES } from "./config";
import { refreshIfNeeded } from "./service";

export function registerRefreshAlarm(): void {
  browser.alarms.create(REFRESH_ALARM_NAME, {
    periodInMinutes: REFRESH_ALARM_PERIOD_MINUTES,
  });
}

export async function handleAlarm(alarm: chrome.alarms.Alarm): Promise<void> {
  if (alarm.name !== REFRESH_ALARM_NAME) return;
  await refreshIfNeeded();
}

export function registerAlarmListener(): void {
  browser.alarms.onAlarm.addListener(handleAlarm);
}
