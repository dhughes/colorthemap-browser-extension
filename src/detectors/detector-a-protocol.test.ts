import { describe, expect, it } from "vitest";
import {
  DETECTOR_A_MARKER,
  isDetectorAMessage,
  type DetectorAMessage,
} from "./detector-a-protocol";

const valid: DetectorAMessage = {
  marker: DETECTOR_A_MARKER,
  format: "gpx",
  via: "fetch",
  url: "https://example.com/route.gpx",
  filename: "route.gpx",
};

describe("isDetectorAMessage", () => {
  it("accepts a well-formed main-world message", () => {
    expect(isDetectorAMessage(valid)).toBe(true);
    expect(isDetectorAMessage({ ...valid, via: "xhr" })).toBe(true);
  });

  it("accepts a message carrying transferred bytes", () => {
    const bytes = new TextEncoder().encode("<gpx/>").buffer;
    expect(isDetectorAMessage({ ...valid, bytes })).toBe(true);
  });

  it("rejects foreign postMessage payloads", () => {
    expect(isDetectorAMessage({ ...valid, marker: "something-else" })).toBe(
      false,
    );
    expect(isDetectorAMessage({ ...valid, format: "zip" })).toBe(false);
    expect(isDetectorAMessage({ ...valid, via: "websocket" })).toBe(false);
    expect(isDetectorAMessage({ ...valid, url: 123 })).toBe(false);
    expect(isDetectorAMessage({ ...valid, filename: 123 })).toBe(false);
    expect(isDetectorAMessage({ ...valid, bytes: "not-bytes" })).toBe(false);
    expect(isDetectorAMessage(null)).toBe(false);
    expect(isDetectorAMessage("ctm-detector-a")).toBe(false);
  });
});
