import { beforeEach, describe, expect, it, vi } from "vitest";
import browser from "webextension-polyfill";
import { REFRESH_ALARM_NAME } from "./config";
import * as service from "./service";
import { handleAlarm, registerRefreshAlarm } from "./alarms";

vi.mock("webextension-polyfill", () => ({
  default: {
    alarms: {
      create: vi.fn(),
      onAlarm: { addListener: vi.fn() },
    },
  },
}));

vi.mock("./service", () => ({
  refreshIfNeeded: vi.fn(async () => undefined),
}));

beforeEach(() => vi.clearAllMocks());

describe("registerRefreshAlarm", () => {
  it("creates a recurring alarm at the MV3 1-minute minimum", () => {
    registerRefreshAlarm();
    expect(browser.alarms.create).toHaveBeenCalledWith(REFRESH_ALARM_NAME, {
      periodInMinutes: 1,
    });
  });
});

describe("handleAlarm", () => {
  it("triggers a proactive refresh when our alarm fires", async () => {
    await handleAlarm({ name: REFRESH_ALARM_NAME } as chrome.alarms.Alarm);
    expect(service.refreshIfNeeded).toHaveBeenCalledTimes(1);
  });

  it("ignores alarms owned by other features", async () => {
    await handleAlarm({ name: "some-other-alarm" } as chrome.alarms.Alarm);
    expect(service.refreshIfNeeded).not.toHaveBeenCalled();
  });
});
