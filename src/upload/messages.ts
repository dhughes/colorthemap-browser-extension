import { GPS_FORMAT_IDS, type GpsFormat } from "../shared/formats";

export const UPLOAD_MESSAGE_TYPES = {
  listMaps: "ctm:list-maps",
  upload: "ctm:upload",
  openToast: "ctm:open-toast",
} as const;

// A Color The Map map, trimmed to what the toast's picker needs.
export interface CtmMap {
  id: number;
  name: string;
}

// Surface → background SW requests.
export interface ListMapsMessage {
  type: typeof UPLOAD_MESSAGE_TYPES.listMaps;
}

// One file in an upload batch. `bytesBase64` (the file the content script
// already holds — Detector A's intercepted body or a same-origin read) takes
// precedence; when absent the background re-fetches `url` (the cross-origin
// link path). Bytes ride as base64 because runtime.sendMessage's JSON
// serialization drops ArrayBuffers. `url` is always carried so the background
// can re-fetch and logs stay meaningful.
export interface UploadFileInput {
  filename: string;
  format: GpsFormat;
  url: string;
  bytesBase64?: string;
}

// One upload request: every file the toast accumulated, sent to one map.
export interface UploadMessage {
  type: typeof UPLOAD_MESSAGE_TYPES.upload;
  mapId: number;
  files: UploadFileInput[];
}

// Background SW → content script: open the upload toast for a detected
// download. Detector B lives in the background (the downloads API), but the
// toast is content-script UI, so the background asks the active tab to show it.
export interface OpenToastMessage {
  type: typeof UPLOAD_MESSAGE_TYPES.openToast;
  url: string;
  filename: string;
  format: GpsFormat;
}

// Why the batch (or the maps list) never got a real answer from CTM. Typed so
// the toast can translate into friendly copy without string-sniffing; set by
// the layer that saw the actual error (instanceof works there — it doesn't
// survive the sendMessage boundary).
export type UploadFailureReason =
  | "sign-in-required"
  | "network"
  | "server"
  | "unknown";

// Background SW → surface responses (returned via the sendMessage promise, the
// same convention the auth handler uses for getAuthState).
export type ListMapsResult =
  | { ok: true; maps: CtmMap[] }
  | { ok: false; reason: UploadFailureReason; detail?: string };

// "done" means the batch was processed (CTM answered, or every file failed
// local validation) — per-file outcomes live in the counts, with CTM's own
// per-file error lines in `errors` (specific and actionable, kept verbatim).
// "error" means a transport/auth failure stopped the whole batch.
export type UploadResult =
  | {
      status: "done";
      uploaded: number;
      duplicates: number;
      failed: number;
      total: number;
      errors: string[];
    }
  | { status: "error"; reason: UploadFailureReason; detail?: string };

export const listMapsMessage = (): ListMapsMessage => ({
  type: UPLOAD_MESSAGE_TYPES.listMaps,
});

export function uploadMessage(params: {
  mapId: number;
  files: UploadFileInput[];
}): UploadMessage {
  return {
    type: UPLOAD_MESSAGE_TYPES.upload,
    mapId: params.mapId,
    files: params.files,
  };
}

export function openToastMessage(params: {
  url: string;
  filename: string;
  format: GpsFormat;
}): OpenToastMessage {
  return {
    type: UPLOAD_MESSAGE_TYPES.openToast,
    url: params.url,
    filename: params.filename,
    format: params.format,
  };
}

export function isOpenToastMessage(value: unknown): value is OpenToastMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === UPLOAD_MESSAGE_TYPES.openToast &&
    isHttpUrl(candidate.url) &&
    typeof candidate.filename === "string" &&
    GPS_FORMAT_IDS.includes(candidate.format as GpsFormat)
  );
}

export function isListMapsMessage(value: unknown): value is ListMapsMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { type?: unknown }).type === UPLOAD_MESSAGE_TYPES.listMaps
  );
}

// The background re-fetches this URL with credentials for the link path, so the
// guard restricts it to http(s) — never file:, data:, or other schemes.
function isHttpUrl(value: unknown): value is string {
  if (typeof value !== "string") {
    return false;
  }
  try {
    const { protocol } = new URL(value);
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

function isUploadFileInput(value: unknown): value is UploadFileInput {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.filename === "string" &&
    GPS_FORMAT_IDS.includes(candidate.format as GpsFormat) &&
    isHttpUrl(candidate.url) &&
    (candidate.bytesBase64 === undefined ||
      typeof candidate.bytesBase64 === "string")
  );
}

export function isUploadMessage(value: unknown): value is UploadMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === UPLOAD_MESSAGE_TYPES.upload &&
    typeof candidate.mapId === "number" &&
    Array.isArray(candidate.files) &&
    candidate.files.length > 0 &&
    candidate.files.every(isUploadFileInput)
  );
}
