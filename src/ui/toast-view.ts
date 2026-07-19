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
// A duration-agnostic drain timer, reused across the offer, sign-in, and
// success windows (all 10s — see COUNTDOWN_MS in upload-toast.ts). Every
// time-sensitive function takes `now` explicitly so the logic is testable
// without real clocks. Elapsed time is banked across pause segments:
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

// ─── Sign-in prompt ──────────────────────────────────────────────────────────
// Copy for the inline Connect card the toast shows when the send flow hits a
// logged-out (or token-rejected) state. Neutral about *why* — it serves both a
// never-signed-in user and an expired session.

export function signInTitle(): string {
  return "Connect to Color The Map";
}

export function signInMessage(fileCount: number): string {
  const files = fileCount === 1 ? "this file" : `these ${fileCount} files`;
  return `Sign in to send ${files} to your maps.`;
}

export function signInRetryMessage(): string {
  return "That didn't finish. Try connecting again.";
}

// ─── Outcome ─────────────────────────────────────────────────────────────────

// One failed file, split into its name and reason so the toast can present
// them on separate lines (CTM's receipt shows the filename apart from the why).
export interface FailureDetail {
  file: string;
  reason: string;
}

export interface OutcomeCard {
  tone: "success" | "warning" | "error";
  title: string;
  message: string;
  // Per-file failures, shown as name-over-reason rows under the message —
  // mirrors CTM's receipt accounting.
  details: FailureDetail[];
  // Whether to offer the "Open your map" link (something landed on the map).
  showMapLink: boolean;
}

// Splits a "name: reason" failure line into its parts. The upload path emits
// this shape (and CTM's own per-file errors follow it too); a line without the
// separator becomes an unattributed reason.
function parseFailure(line: string): FailureDetail {
  const at = line.indexOf(": ");
  if (at === -1) {
    return { file: "", reason: line };
  }
  return { file: line.slice(0, at), reason: line.slice(at + 2) };
}

// A CTM-style tally in fixed order (added · already on your map · failed) —
// only the non-zero buckets, so "1 added · 2 already on your map" reads at a
// glance. (Same-map and cross-source duplicates are merged as "already on your
// map"; the extension doesn't need CTM's synced-version nuance.)
function outcomeTally(result: {
  uploaded: number;
  duplicates: number;
  failed: number;
}): string {
  const parts: string[] = [];
  if (result.uploaded > 0) parts.push(`${result.uploaded} added`);
  if (result.duplicates > 0)
    parts.push(`${result.duplicates} already on your map`);
  if (result.failed > 0) parts.push(`${result.failed} failed`);
  return parts.join(" · ");
}

// Turns an upload outcome into the card the toast shows, mimicking CTM's upload
// receipt: a disposition (clean / issues / failed), a tally of the buckets, and
// per-file reasons under failures. An "error" result (transport/auth failure)
// is handed to translateFailureReason instead.
export function describeUploadOutcome(
  result: UploadResult,
  mapName: string,
): OutcomeCard {
  if (result.status === "error") {
    return translateFailureReason(result.reason, result.detail);
  }

  const landed = result.uploaded + result.duplicates;
  const tally = outcomeTally(result);

  // CTM accepted and rejected nothing — treat as a soft failure.
  if (landed === 0 && result.failed === 0) {
    return {
      tone: "error",
      title: "Nothing to add",
      message: `Color The Map didn't find anything to import to ${mapName}.`,
      details: [],
      showMapLink: false,
    };
  }

  // Clean — nothing failed.
  if (result.failed === 0) {
    return {
      tone: "success",
      title: result.uploaded > 0 ? "You're on the map" : "Already on your map",
      message: tally,
      details: [],
      showMapLink: true,
    };
  }

  const failures = result.errors.map(parseFailure);

  // Some landed, some failed.
  if (landed > 0) {
    return {
      tone: "warning",
      title: "Not everything made it",
      message: tally,
      details: failures,
      showMapLink: true,
    };
  }

  // Nothing landed. The failure rows carry the why; keep a fallback line for
  // when CTM said nothing.
  return {
    tone: "error",
    title:
      result.total === 1
        ? "Couldn't add that file"
        : "Couldn't add those files",
    message:
      failures.length > 0
        ? ""
        : "Color The Map couldn't read it. Double-check it and try again.",
    details: failures,
    showMapLink: false,
  };
}

// Failures translated into approachable copy. Connectivity and auth get a
// friendly, self-explanatory message; a server rejection surfaces CTM's own
// message (its API returns clean `{detail}` text — "Map not found", "No track
// points found", etc.), which is specific and actionable, falling back to a
// generic line only when CTM said nothing useful. #20 extends this by adding a
// UploadFailureReason case.
export function translateFailureReason(
  reason: UploadFailureReason,
  detail?: string,
): OutcomeCard {
  switch (reason) {
    case "sign-in-required":
      // Fallback only — the toast intercepts this reason and shows its inline
      // Connect card instead of routing here. Kept neutral (no "session
      // expired") and actionless in case some path ever renders it directly.
      return {
        tone: "error",
        title: "Sign in to Color The Map",
        message: "Sign in and try again.",
        details: [],
        showMapLink: false,
      };
    case "network":
      return {
        tone: "error",
        title: "Couldn't reach Color The Map",
        message: "Check your connection and give it another try.",
        details: [],
        showMapLink: false,
      };
    case "permission-denied":
      return {
        tone: "error",
        title: "Permission needed",
        message:
          "Color The Map needs your OK to read that file. Try again to allow it.",
        details: [],
        showMapLink: false,
      };
    case "server":
      return {
        tone: "error",
        title: "Couldn't add your file",
        message:
          detail && detail.trim() !== ""
            ? detail
            : "Color The Map couldn't add your file. Please try again.",
        details: [],
        showMapLink: false,
      };
    case "unknown":
      return {
        tone: "error",
        title: "That didn't work",
        message: "Something went wrong. Please try again.",
        details: [],
        showMapLink: false,
      };
  }
}
