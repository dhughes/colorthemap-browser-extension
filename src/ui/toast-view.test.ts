import { describe, expect, it } from "vitest";
import type { UploadResult } from "../upload/messages";
import {
  addDetectedFile,
  cancelCountdown,
  countdownRemainingFraction,
  describeUploadOutcome,
  isCountdownElapsed,
  offerTitle,
  originsNeedingPermission,
  pauseCountdown,
  resetCountdown,
  resolveInitialMapId,
  resumeCountdown,
  sendButtonLabel,
  startCountdown,
  successDeepLink,
  translateFailureReason,
  type DetectedFile,
} from "./toast-view";

const file = (over: Partial<DetectedFile> = {}): DetectedFile => ({
  url: "https://example.com/a.gpx",
  filename: "a.gpx",
  format: "gpx",
  ...over,
});

describe("resolveInitialMapId", () => {
  const maps = [
    { id: 1, name: "Trails" },
    { id: 7, name: "Rides" },
  ];

  it("returns null when the user has no maps", () => {
    expect(resolveInitialMapId([], 5)).toBeNull();
  });

  it("pre-selects the last-used map when it still exists", () => {
    expect(resolveInitialMapId(maps, 7)).toBe(7);
  });

  it("falls back to the first map when there's no last-used", () => {
    expect(resolveInitialMapId(maps, null)).toBe(1);
  });

  it("falls back to the first map when the last-used map was deleted", () => {
    expect(resolveInitialMapId(maps, 999)).toBe(1);
  });
});

describe("addDetectedFile", () => {
  it("appends a new file, preserving insertion order", () => {
    const first = file({ url: "https://x/a.gpx", filename: "a.gpx" });
    const second = file({ url: "https://x/b.gpx", filename: "b.gpx" });

    const result = addDetectedFile([first], second);

    expect(result.added).toBe(true);
    expect(result.files.map((f) => f.filename)).toEqual(["a.gpx", "b.gpx"]);
  });

  it("dedupes by URL", () => {
    const existing = [file({ url: "https://x/a.gpx" })];

    const result = addDetectedFile(existing, file({ url: "https://x/a.gpx" }));

    expect(result.added).toBe(false);
    expect(result.files).toHaveLength(1);
  });

  it("upgrades a bytesless entry when the same URL arrives with bytes", () => {
    const existing = [file({ url: "https://x/a.gpx", bytesBase64: undefined })];

    const result = addDetectedFile(
      existing,
      file({ url: "https://x/a.gpx", bytesBase64: "PGdweC8+" }),
    );

    expect(result.added).toBe(false);
    expect(result.files).toHaveLength(1);
    expect(result.files[0]!.bytesBase64).toBe("PGdweC8+");
  });

  it("keeps existing bytes when a bytesless duplicate arrives", () => {
    const existing = [
      file({ url: "https://x/a.gpx", bytesBase64: "PGdweC8+" }),
    ];

    const result = addDetectedFile(
      existing,
      file({ url: "https://x/a.gpx", bytesBase64: undefined }),
    );

    expect(result.files[0]!.bytesBase64).toBe("PGdweC8+");
  });
});

describe("countdown", () => {
  const DURATION = 15_000;

  it("starts full and running", () => {
    const state = startCountdown(DURATION, 1000);
    expect(state.status).toBe("running");
    expect(countdownRemainingFraction(state, 1000)).toBe(1);
  });

  it("drains linearly while running", () => {
    const state = startCountdown(DURATION, 0);
    expect(countdownRemainingFraction(state, 7500)).toBeCloseTo(0.5);
    expect(countdownRemainingFraction(state, 15_000)).toBe(0);
  });

  it("clamps the fraction to zero past the duration", () => {
    const state = startCountdown(DURATION, 0);
    expect(countdownRemainingFraction(state, 20_000)).toBe(0);
  });

  it("is elapsed only once the running duration is spent", () => {
    const state = startCountdown(DURATION, 0);
    expect(isCountdownElapsed(state, 14_999)).toBe(false);
    expect(isCountdownElapsed(state, 15_000)).toBe(true);
  });

  it("freezes remaining time while paused", () => {
    const running = startCountdown(DURATION, 0);
    const paused = pauseCountdown(running, 6000); // 9s banked remaining

    expect(countdownRemainingFraction(paused, 60_000)).toBeCloseTo(0.6);
    expect(isCountdownElapsed(paused, 60_000)).toBe(false);
  });

  it("resumes from the banked remaining time", () => {
    const running = startCountdown(DURATION, 0);
    const paused = pauseCountdown(running, 6000); // 9s left
    const resumed = resumeCountdown(paused, 100_000);

    // 3s after resume → 6s left → 0.4 remaining
    expect(countdownRemainingFraction(resumed, 103_000)).toBeCloseTo(0.4);
  });

  it("ignores pause when not running and resume when not paused", () => {
    const running = startCountdown(DURATION, 0);
    expect(resumeCountdown(running, 5000)).toBe(running);

    const canceled = cancelCountdown(running);
    expect(pauseCountdown(canceled, 5000)).toBe(canceled);
  });

  it("stays canceled permanently and never elapses", () => {
    const canceled = cancelCountdown(startCountdown(DURATION, 0));
    expect(canceled.status).toBe("canceled");
    expect(isCountdownElapsed(canceled, 999_999)).toBe(false);
    expect(resumeCountdown(canceled, 1000).status).toBe("canceled");
  });

  it("resets to full while preserving status (a new file must not restart a canceled timer)", () => {
    const canceled = cancelCountdown(startCountdown(DURATION, 0));
    const reset = resetCountdown(canceled, 50_000);

    expect(reset.status).toBe("canceled");
    expect(isCountdownElapsed(reset, 999_999)).toBe(false);
  });

  it("resets a running timer back to full", () => {
    const running = startCountdown(DURATION, 0);
    const reset = resetCountdown(running, 10_000);

    expect(reset.status).toBe("running");
    expect(countdownRemainingFraction(reset, 10_000)).toBe(1);
    expect(countdownRemainingFraction(reset, 17_500)).toBeCloseTo(0.5);
  });
});

describe("originsNeedingPermission", () => {
  const PAGE = "https://trailhub.example";

  it("returns the distinct cross-origin hosts that lack bytes", () => {
    const origins = originsNeedingPermission(
      [
        file({ url: "https://a.example/x.gpx" }),
        file({ url: "https://a.example/y.gpx" }), // same host — deduped
        file({ url: "https://b.example/z.gpx" }),
      ],
      PAGE,
    );
    expect(origins).toEqual(["https://a.example/*", "https://b.example/*"]);
  });

  it("excludes same-origin files (the content script reads them)", () => {
    expect(
      originsNeedingPermission([file({ url: `${PAGE}/local.gpx` })], PAGE),
    ).toEqual([]);
  });

  it("excludes files that already carry bytes", () => {
    expect(
      originsNeedingPermission(
        [file({ url: "https://a.example/x.gpx", bytesBase64: "PGdweC8+" })],
        PAGE,
      ),
    ).toEqual([]);
  });

  it("strips the port from the match pattern", () => {
    expect(
      originsNeedingPermission(
        [file({ url: "http://127.0.0.1:8080/x.gpx" })],
        PAGE,
      ),
    ).toEqual(["http://127.0.0.1/*"]);
  });

  it("skips an unparseable URL", () => {
    expect(
      originsNeedingPermission([file({ url: "not a url" })], PAGE),
    ).toEqual([]);
  });
});

describe("offerTitle", () => {
  it("reads naturally for one file", () => {
    expect(offerTitle(1)).toBe("Found a GPS file");
  });

  it("counts multiple files", () => {
    expect(offerTitle(3)).toBe("Found 3 GPS files");
  });
});

describe("sendButtonLabel", () => {
  it("is a plain send for one file", () => {
    expect(sendButtonLabel(1)).toBe("Send");
  });

  it("counts the batch for multiple files", () => {
    expect(sendButtonLabel(4)).toBe("Send all 4");
  });
});

describe("successDeepLink", () => {
  it("links to the map's page", () => {
    expect(successDeepLink(42)).toMatch(/\/maps\/42$/);
  });
});

describe("describeUploadOutcome", () => {
  const done = (
    over: Partial<UploadResult & { status: "done" }> = {},
  ): UploadResult => ({
    status: "done",
    uploaded: 0,
    duplicates: 0,
    failed: 0,
    total: 0,
    errors: [],
    ...over,
  });

  it("celebrates a full success and offers the map link", () => {
    const card = describeUploadOutcome(
      done({ uploaded: 2, total: 2 }),
      "Trails",
    );
    expect(card.tone).toBe("success");
    expect(card.showMapLink).toBe(true);
    expect(card.message).toContain("Trails");
  });

  it("treats an all-duplicate batch as a benign success", () => {
    const card = describeUploadOutcome(
      done({ duplicates: 1, total: 1 }),
      "Trails",
    );
    expect(card.tone).toBe("success");
    expect(card.showMapLink).toBe(true);
  });

  it("warns on a partial batch but still links the map", () => {
    const card = describeUploadOutcome(
      done({ uploaded: 2, failed: 1, total: 3 }),
      "Trails",
    );
    expect(card.tone).toBe("warning");
    expect(card.showMapLink).toBe(true);
    expect(card.title).toContain("2 of 3");
  });

  it("treats an all-failed batch as an error with no map link", () => {
    const card = describeUploadOutcome(
      done({ failed: 2, total: 2, errors: ["route.kml: Unsupported"] }),
      "Trails",
    );
    expect(card.tone).toBe("error");
    expect(card.showMapLink).toBe(false);
  });

  it("surfaces CTM's per-file reason on an all-failed batch", () => {
    const card = describeUploadOutcome(
      done({
        failed: 1,
        total: 1,
        errors: ["route.kml: Unsupported file type"],
      }),
      "Trails",
    );
    expect(card.message).toContain("Unsupported file type");
  });

  it("falls back to a generic line when CTM gave no per-file reason", () => {
    const card = describeUploadOutcome(
      done({ failed: 1, total: 1, errors: [] }),
      "Trails",
    );
    expect(card.message.toLowerCase()).toContain("couldn't read it");
  });

  it("translates a transport/auth failure into friendly copy", () => {
    const card = describeUploadOutcome(
      { status: "error", reason: "sign-in-required" },
      "Trails",
    );
    expect(card.tone).toBe("error");
    expect(card.action).toEqual({ label: "Sign in", kind: "sign-in" });
    expect(card.showMapLink).toBe(false);
  });
});

describe("translateFailureReason", () => {
  it("asks the user to sign in again on an expired session", () => {
    const card = translateFailureReason("sign-in-required");
    expect(card.action).toEqual({ label: "Sign in", kind: "sign-in" });
    expect(card.message.toLowerCase()).toContain("sign in");
  });

  it("names a connection problem on a network failure", () => {
    const card = translateFailureReason("network");
    expect(card.action).toBeNull();
    expect(card.message.toLowerCase()).toContain("connection");
  });

  it("explains a declined permission", () => {
    const card = translateFailureReason("permission-denied");
    expect(`${card.title} ${card.message}`.toLowerCase()).toContain(
      "permission",
    );
  });

  it("stays generic and friendly on a server or unknown failure", () => {
    for (const reason of ["server", "unknown"] as const) {
      const card = translateFailureReason(reason);
      expect(card.tone).toBe("error");
      expect(card.action).toBeNull();
      expect(card.message).toBeTruthy();
    }
  });

  it("surfaces CTM's own message on a server rejection", () => {
    const card = translateFailureReason("server", "Map not found");
    expect(card.message).toBe("Map not found");
  });

  it("falls back to a generic line when the server said nothing useful", () => {
    const card = translateFailureReason("server", "  ");
    expect(card.message.toLowerCase()).toContain("couldn't add");
  });
});
