import { CTM_BASE_URL } from "../auth/config";
import type { GpsFormat } from "../shared/formats";
import type {
  CtmMap,
  UploadFailureReason,
  UploadResult,
} from "../upload/messages";

// One detected download the toast is offering to send. Bytes ride along when a
// detector already captured them (Detector A / a same-origin read).
export interface DetectedFile {
  url: string;
  filename: string;
  format: GpsFormat;
  bytesBase64?: string;
}

// Which map the picker should start on: the last one used on this site if it
// still exists, otherwise the first map. Null when the user has no maps.
export function resolveInitialMapId(
  maps: CtmMap[],
  lastMapId: number | null,
): number | null {
  if (maps.length === 0) {
    return null;
  }
  if (lastMapId !== null && maps.some((map) => map.id === lastMapId)) {
    return lastMapId;
  }
  return maps[0]!.id;
}

// Accumulates a newly detected file into the toast's list. Deduped by URL,
// insertion order preserved. When the same URL arrives again carrying bytes it
// didn't have before (e.g. Detector C queued the link, then Detector A's
// fetch-wrap caught the body), the richer entry replaces the poorer one so Send
// needn't re-fetch. `added` is false for a dedupe — the caller uses it to decide
// whether the countdown resets.
export function addDetectedFile(
  files: DetectedFile[],
  next: DetectedFile,
): { files: DetectedFile[]; added: boolean } {
  const index = files.findIndex((f) => f.url === next.url);
  if (index === -1) {
    return { files: [...files, next], added: true };
  }
  const existing = files[index]!;
  if (existing.bytesBase64 === undefined && next.bytesBase64 !== undefined) {
    const upgraded = [...files];
    upgraded[index] = { ...existing, bytesBase64: next.bytesBase64 };
    return { files: upgraded, added: false };
  }
  return { files, added: false };
}

// Distinct origins the background must be granted to re-fetch: files that are
// cross-origin to the page (the content script can't read them) and carry no
// captured bytes. Same-origin files are read by the content script itself, and
// files with bytes need nothing. Origins are scheme+host only — match patterns
// can't carry a port.
export function originsNeedingPermission(
  files: DetectedFile[],
  pageOrigin: string,
): string[] {
  const origins = new Set<string>();
  for (const file of files) {
    if (file.bytesBase64 !== undefined) {
      continue;
    }
    let url: URL;
    try {
      url = new URL(file.url);
    } catch {
      continue; // unparseable — nothing to request
    }
    if (url.origin === pageOrigin) {
      continue; // same-origin: the content script reads it
    }
    origins.add(`${url.protocol}//${url.hostname}/*`);
  }
  return [...origins];
}

// ─── Countdown ───────────────────────────────────────────────────────────────
// A duration-agnostic drain timer, reused for the offer (15s) and success (10s)
// windows. Every time-sensitive function takes `now` explicitly so the logic is
// testable without real clocks. Elapsed time is banked across pause segments:
// while running it accrues from `segmentStartedAt`; while paused/canceled it's
// frozen at `consumedMs`.

export type CountdownStatus = "running" | "paused" | "canceled";

export interface CountdownState {
  status: CountdownStatus;
  durationMs: number;
  segmentStartedAt: number;
  consumedMs: number;
}

export function startCountdown(
  durationMs: number,
  now: number,
): CountdownState {
  return {
    status: "running",
    durationMs,
    segmentStartedAt: now,
    consumedMs: 0,
  };
}

// Restarts the drain to full while PRESERVING status: a file arriving after the
// user has paused (hover) or canceled (engaged) the timer must not yank it back
// to running under them. Only a still-running timer visibly restarts.
export function resetCountdown(
  state: CountdownState,
  now: number,
): CountdownState {
  return { ...state, segmentStartedAt: now, consumedMs: 0 };
}

export function pauseCountdown(
  state: CountdownState,
  now: number,
): CountdownState {
  if (state.status !== "running") {
    return state;
  }
  return {
    ...state,
    status: "paused",
    consumedMs: elapsedMs(state, now),
  };
}

export function resumeCountdown(
  state: CountdownState,
  now: number,
): CountdownState {
  if (state.status !== "paused") {
    return state;
  }
  return { ...state, status: "running", segmentStartedAt: now };
}

export function cancelCountdown(state: CountdownState): CountdownState {
  return { ...state, status: "canceled" };
}

function elapsedMs(state: CountdownState, now: number): number {
  if (state.status === "running") {
    return state.consumedMs + (now - state.segmentStartedAt);
  }
  return state.consumedMs;
}

// Remaining fraction (1 → full, 0 → empty), clamped. Drives the bar's scaleX.
export function countdownRemainingFraction(
  state: CountdownState,
  now: number,
): number {
  const remaining = state.durationMs - elapsedMs(state, now);
  return Math.min(1, Math.max(0, remaining / state.durationMs));
}

export function isCountdownElapsed(
  state: CountdownState,
  now: number,
): boolean {
  return (
    state.status === "running" && elapsedMs(state, now) >= state.durationMs
  );
}

// ─── Copy ──────────────────────────────────────────────────────────────────

export function offerTitle(fileCount: number): string {
  return fileCount === 1 ? "Found a GPS file" : `Found ${fileCount} GPS files`;
}

// Terse, per CTM's DialogFooter convention (short verbs, not long phrases —
// the card's title and map line already say what's going where).
export function sendButtonLabel(fileCount: number): string {
  return fileCount === 1 ? "Send" : `Send all ${fileCount}`;
}

// The map's page on Color The Map. Client-side only — no server round-trip. #29
// will extend this to center on the uploaded track once CTM supports it.
export function successDeepLink(mapId: number): string {
  return `${CTM_BASE_URL}/maps/${mapId}`;
}

// ─── Outcome ─────────────────────────────────────────────────────────────────

export interface OutcomeCard {
  tone: "success" | "warning" | "error";
  title: string;
  message: string;
  // Whether to offer the "Open your map" link (something landed on the map).
  showMapLink: boolean;
  // An extra action beyond Done, e.g. re-authenticating.
  action: { label: string; kind: "sign-in" } | null;
}

function tracks(count: number): string {
  return count === 1 ? "1 track" : `${count} tracks`;
}

// Turns an upload outcome into the card the toast shows. A "done" result is
// summarized from its counts; an "error" result (transport/auth failure) is
// handed to translateFailureReason for friendly copy. CTM's raw per-file error
// lines are never rendered — they're kept in the result for logging only.
export function describeUploadOutcome(
  result: UploadResult,
  mapName: string,
): OutcomeCard {
  if (result.status === "error") {
    return translateFailureReason(result.reason);
  }

  const landed = result.uploaded + result.duplicates;

  if (result.failed === 0 && landed > 0) {
    const message =
      result.uploaded > 0
        ? `${tracks(result.uploaded)} added to ${mapName}.`
        : `Already on ${mapName}.`;
    return {
      tone: "success",
      title: "You're on the map",
      message,
      showMapLink: true,
      action: null,
    };
  }

  if (landed > 0 && result.failed > 0) {
    return {
      tone: "warning",
      title: `Added ${landed} of ${result.total}`,
      message: `The rest couldn't be read, but the others are on ${mapName}.`,
      showMapLink: true,
      action: null,
    };
  }

  // Nothing landed.
  return {
    tone: "error",
    title:
      result.total === 1
        ? "Couldn't add that file"
        : "Couldn't add those files",
    message:
      "Color The Map couldn't read it. Double-check the file and try again.",
    showMapLink: false,
    action: null,
  };
}

// Transport/auth failures translated into approachable copy. This deliberately
// supersedes the old "surface CTM's message verbatim" rule for the toast — #20
// extends it by adding a UploadFailureReason case and a branch here.
export function translateFailureReason(
  reason: UploadFailureReason,
): OutcomeCard {
  switch (reason) {
    case "sign-in-required":
      return {
        tone: "error",
        title: "Please sign in again",
        message: "Your Color The Map session expired. Sign in and try again.",
        showMapLink: false,
        action: { label: "Sign in", kind: "sign-in" },
      };
    case "network":
      return {
        tone: "error",
        title: "Couldn't reach Color The Map",
        message: "Check your connection and give it another try.",
        showMapLink: false,
        action: null,
      };
    case "permission-denied":
      return {
        tone: "error",
        title: "Permission needed",
        message:
          "Color The Map needs your OK to read that file. Try again to allow it.",
        showMapLink: false,
        action: null,
      };
    case "server":
    case "unknown":
      return {
        tone: "error",
        title: "That didn't work",
        message: "Color The Map couldn't add your file. Please try again.",
        showMapLink: false,
        action: null,
      };
  }
}
