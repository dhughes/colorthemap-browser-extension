import { GPS_FORMAT_IDS, type GpsFormat } from "../shared/formats";

export const UPLOAD_MESSAGE_TYPES = {
  listMaps: "ctm:list-maps",
  upload: "ctm:upload",
  openDialog: "ctm:open-dialog",
} as const;

// A Color The Map map, trimmed to what the dialog's selector needs.
export interface CtmMap {
  id: number;
  name: string;
}

// Surface → background SW requests.
export interface ListMapsMessage {
  type: typeof UPLOAD_MESSAGE_TYPES.listMaps;
}

// One upload request. `bytesBase64` (the file the content script already holds —
// Detector A's intercepted body or a same-origin read) takes precedence; when
// absent the background re-fetches `url` (the cross-origin link path). Bytes ride
// as base64 because runtime.sendMessage's JSON serialization drops ArrayBuffers.
// `url` is always carried so the background can re-fetch and logs stay meaningful.
export interface UploadMessage {
  type: typeof UPLOAD_MESSAGE_TYPES.upload;
  mapId: number;
  filename: string;
  format: GpsFormat;
  url: string;
  bytesBase64?: string;
}

// Background SW → content script: open the upload dialog for a detected
// download. Detector B lives in the background (the downloads API), but the
// dialog is content-script UI, so the background asks the active tab to show it.
export interface OpenDialogMessage {
  type: typeof UPLOAD_MESSAGE_TYPES.openDialog;
  url: string;
  filename: string;
  format: GpsFormat;
}

// Background SW → surface responses (returned via the sendMessage promise, the
// same convention the auth handler uses for getAuthState).
export type ListMapsResult =
  | { ok: true; maps: CtmMap[] }
  | { ok: false; error: string };

export type UploadStatus = "ok" | "duplicate" | "error";

export interface UploadResult {
  status: UploadStatus;
  // CTM's actual message, surfaced verbatim — never generalized.
  detail?: string;
}

export const listMapsMessage = (): ListMapsMessage => ({
  type: UPLOAD_MESSAGE_TYPES.listMaps,
});

export function uploadMessage(params: {
  mapId: number;
  filename: string;
  format: GpsFormat;
  url: string;
  bytesBase64?: string;
}): UploadMessage {
  const message: UploadMessage = {
    type: UPLOAD_MESSAGE_TYPES.upload,
    mapId: params.mapId,
    filename: params.filename,
    format: params.format,
    url: params.url,
  };
  if (params.bytesBase64 !== undefined) {
    message.bytesBase64 = params.bytesBase64;
  }
  return message;
}

export function openDialogMessage(params: {
  url: string;
  filename: string;
  format: GpsFormat;
}): OpenDialogMessage {
  return {
    type: UPLOAD_MESSAGE_TYPES.openDialog,
    url: params.url,
    filename: params.filename,
    format: params.format,
  };
}

export function isOpenDialogMessage(
  value: unknown,
): value is OpenDialogMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === UPLOAD_MESSAGE_TYPES.openDialog &&
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

export function isUploadMessage(value: unknown): value is UploadMessage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    candidate.type === UPLOAD_MESSAGE_TYPES.upload &&
    typeof candidate.mapId === "number" &&
    typeof candidate.filename === "string" &&
    GPS_FORMAT_IDS.includes(candidate.format as GpsFormat) &&
    isHttpUrl(candidate.url) &&
    (candidate.bytesBase64 === undefined ||
      typeof candidate.bytesBase64 === "string")
  );
}
