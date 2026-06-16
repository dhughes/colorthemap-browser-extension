import { describe, expect, it } from "vitest";
import {
  DETECTION_MESSAGE_TYPE,
  createDetectionMessage,
  formatDetectionLog,
  isDetectionMessage,
  type DetectionPayload,
} from "./messages";

const validPayload: DetectionPayload = {
  detector: "C",
  format: "gpx",
  source: "link",
  url: "https://example.com/route.gpx",
};

describe("createDetectionMessage", () => {
  it("stamps the discriminant type and preserves the payload", () => {
    const message = createDetectionMessage(validPayload);
    expect(message).toEqual({
      type: DETECTION_MESSAGE_TYPE,
      detector: "C",
      format: "gpx",
      source: "link",
      url: "https://example.com/route.gpx",
    });
  });

  it("carries an optional sizeHint when provided", () => {
    const message = createDetectionMessage({ ...validPayload, sizeHint: 2048 });
    expect(message.sizeHint).toBe(2048);
  });
});

describe("isDetectionMessage", () => {
  it("accepts a well-formed detection message", () => {
    expect(isDetectionMessage(createDetectionMessage(validPayload))).toBe(true);
  });

  it("accepts every valid detector and source", () => {
    const detectors = ["A", "B", "C"] as const;
    const sources = ["link", "fetch", "xhr", "download"] as const;
    for (const detector of detectors) {
      for (const source of sources) {
        expect(
          isDetectionMessage(
            createDetectionMessage({ ...validPayload, detector, source }),
          ),
        ).toBe(true);
      }
    }
  });

  it("rejects messages with the wrong or missing type", () => {
    expect(isDetectionMessage({ ...validPayload })).toBe(false);
    expect(
      isDetectionMessage({
        ...createDetectionMessage(validPayload),
        type: "other",
      }),
    ).toBe(false);
  });

  it("rejects unknown detectors, formats, and sources", () => {
    const base = createDetectionMessage(validPayload);
    expect(isDetectionMessage({ ...base, detector: "D" })).toBe(false);
    expect(isDetectionMessage({ ...base, format: "zip" })).toBe(false);
    expect(isDetectionMessage({ ...base, source: "click" })).toBe(false);
  });

  it("rejects a non-string url and a non-number sizeHint", () => {
    const base = createDetectionMessage(validPayload);
    expect(isDetectionMessage({ ...base, url: 42 })).toBe(false);
    expect(isDetectionMessage({ ...base, sizeHint: "big" })).toBe(false);
  });

  it("rejects non-objects", () => {
    expect(isDetectionMessage(null)).toBe(false);
    expect(isDetectionMessage(undefined)).toBe(false);
    expect(isDetectionMessage("ctm-detection")).toBe(false);
  });
});

describe("formatDetectionLog", () => {
  it("renders the uniform acceptance-criteria log line", () => {
    expect(formatDetectionLog(createDetectionMessage(validPayload))).toBe(
      "[detector:C] would send https://example.com/route.gpx to CTM (gpx, source=link)",
    );
  });

  it("reflects each detector and source faithfully", () => {
    expect(
      formatDetectionLog(
        createDetectionMessage({
          detector: "A",
          format: "kmz",
          source: "fetch",
          url: "https://example.com/tour.kmz",
        }),
      ),
    ).toBe(
      "[detector:A] would send https://example.com/tour.kmz to CTM (kmz, source=fetch)",
    );
  });
});
