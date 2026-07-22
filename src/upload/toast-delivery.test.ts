import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("webextension-polyfill", () => ({
  default: {
    tabs: {
      query: vi.fn(),
      sendMessage: vi.fn(),
    },
  },
}));

import browser from "webextension-polyfill";
import {
  deliverDownloadToast,
  isDeliveredOutcome,
  TOAST_DELIVERY_DELAYS_MS,
} from "./toast-delivery";

const query = vi.mocked(browser.tabs.query);
const sendMessage = vi.mocked(browser.tabs.sendMessage);

const detection = {
  format: "gpx" as const,
  url: "https://files.example/track.gpx",
  filename: "track.gpx",
};

const noSleep = async (): Promise<void> => undefined;

beforeEach(() => {
  query.mockReset();
  sendMessage.mockReset();
});

describe("isDeliveredOutcome", () => {
  it("treats a listener that never responded as delivered", () => {
    expect(
      isDeliveredOutcome(
        new Error("The message port closed before a response was received."),
      ),
    ).toBe(true);
  });

  it("treats a tab with no content script as not delivered", () => {
    expect(
      isDeliveredOutcome(
        new Error(
          "Could not establish connection. Receiving end does not exist.",
        ),
      ),
    ).toBe(false);
  });
});

describe("deliverDownloadToast", () => {
  it("delivers on the first try without sleeping", async () => {
    query.mockResolvedValue([{ id: 7 }] as never);
    sendMessage.mockResolvedValue(undefined);
    const sleep = vi.fn(noSleep);

    expect(await deliverDownloadToast(detection, sleep)).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it("retries past the ephemeral download tab and reaches the page", async () => {
    query.mockResolvedValue([{ id: 7 }] as never);
    sendMessage
      .mockRejectedValueOnce(
        new Error(
          "Could not establish connection. Receiving end does not exist.",
        ),
      )
      .mockResolvedValueOnce(undefined);
    const sleep = vi.fn(noSleep);

    expect(await deliverDownloadToast(detection, sleep)).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledWith(TOAST_DELIVERY_DELAYS_MS[1]);
  });

  it("retries when there is no active tab at all", async () => {
    query
      .mockResolvedValueOnce([] as never)
      .mockResolvedValue([{ id: 7 }] as never);
    sendMessage.mockResolvedValue(undefined);

    expect(await deliverDownloadToast(detection, noSleep)).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("counts an unresponsive listener as a delivery, not a retry", async () => {
    query.mockResolvedValue([{ id: 7 }] as never);
    sendMessage.mockRejectedValue(
      new Error("The message port closed before a response was received."),
    );

    expect(await deliverDownloadToast(detection, noSleep)).toBe(true);
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });

  it("gives up after exhausting every delay", async () => {
    query.mockResolvedValue([{ id: 7 }] as never);
    sendMessage.mockRejectedValue(
      new Error(
        "Could not establish connection. Receiving end does not exist.",
      ),
    );
    const sleep = vi.fn(noSleep);

    expect(await deliverDownloadToast(detection, sleep)).toBe(false);
    expect(sendMessage).toHaveBeenCalledTimes(TOAST_DELIVERY_DELAYS_MS.length);
  });
});
