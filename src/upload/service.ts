import { CTM_BASE_URL } from "../auth/config";
import { safeFilename } from "../shared/detection-url";
import { readCtmError } from "./ctm-error";
import type { UploadResult } from "./messages";

// CTM's synchronous single-file upload response (BatchUploadResponse). The
// import is done by the time this returns, so success, duplicates, and parse
// failures are all reported here — no SSE needed.
interface BatchUploadResponse {
  uploaded: number;
  failed: number;
  track_ids: number[];
  errors: string[];
  duplicates: string[];
  cross_source_duplicates: string[];
}

// Fetches the file at `url` with the user's session cookies. The background SW
// needs a host permission for the URL's origin (requested at the dialog's Send
// click); without it this fetch is blocked. Used for the Detector C link path,
// where no intercepted body exists.
export async function fetchFileBytes(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(await readCtmError(response));
  }
  return response.arrayBuffer();
}

// Uploads one GPS file to a CTM map via the legacy multipart endpoint and maps
// CTM's response to a single outcome. Errors carry CTM's actual message.
export async function uploadTrack(params: {
  accessToken: string;
  mapId: number;
  filename: string;
  bytes: ArrayBuffer;
  baseUrl?: string;
}): Promise<UploadResult> {
  const baseUrl = params.baseUrl ?? CTM_BASE_URL;
  const form = new FormData();
  form.append("files", new Blob([params.bytes]), safeFilename(params.filename));

  const response = await fetch(
    `${baseUrl}/api/v1/maps/${params.mapId}/tracks`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${params.accessToken}` },
      body: form,
    },
  );

  if (!response.ok) {
    return { status: "error", detail: await readCtmError(response) };
  }

  const body = (await response.json()) as BatchUploadResponse;

  if (body.failed > 0) {
    return {
      status: "error",
      detail: body.errors[0] ?? `${body.failed} file(s) failed to import.`,
    };
  }
  if (body.uploaded > 0) {
    return { status: "ok" };
  }
  if (body.duplicates.length > 0 || body.cross_source_duplicates.length > 0) {
    return { status: "duplicate" };
  }
  // Nothing uploaded, failed, or duplicated — don't claim success.
  return {
    status: "error",
    detail: body.errors[0] ?? "Color The Map didn't accept the file.",
  };
}
