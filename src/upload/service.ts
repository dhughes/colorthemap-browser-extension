import { CTM_BASE_URL } from "../auth/config";
import { safeFilename } from "../shared/detection-url";
import { ctmFetch } from "./fetch-ctm";

// CTM's synchronous multi-file upload response (BatchUploadResponse). The import
// is done by the time this returns, so success, duplicates, and parse failures
// are all reported here — no SSE needed.
interface BatchUploadResponse {
  uploaded: number;
  failed: number;
  track_ids: number[];
  errors: string[];
  duplicates: string[];
  cross_source_duplicates: string[];
}

// What one CTM batch POST produced, trimmed to the counts + verbatim per-file
// error lines the toast needs. Transport/auth failures never reach here — they
// throw out of ctmFetch and are classified in the handler.
export interface BatchOutcome {
  uploaded: number;
  duplicates: number;
  failed: number;
  errors: string[];
}

// Fetches the file at `url` with the user's session cookies. The background SW
// needs a host permission for the URL's origin (requested at the toast's Send
// click); without it this fetch is blocked. Used for the Detector C link path,
// where no intercepted body exists.
export async function fetchFileBytes(url: string): Promise<ArrayBuffer> {
  const response = await ctmFetch(url, { credentials: "include" });
  return response.arrayBuffer();
}

// Uploads a batch of GPS files to one CTM map via the multipart endpoint
// (`files: List[UploadFile]`) and reduces CTM's response to plain counts.
export async function uploadTracks(params: {
  accessToken: string;
  mapId: number;
  files: Array<{ filename: string; bytes: ArrayBuffer }>;
  baseUrl?: string;
}): Promise<BatchOutcome> {
  const baseUrl = params.baseUrl ?? CTM_BASE_URL;
  const form = new FormData();
  for (const file of params.files) {
    form.append("files", new Blob([file.bytes]), safeFilename(file.filename));
  }

  const response = await ctmFetch(
    `${baseUrl}/api/v1/maps/${params.mapId}/tracks`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${params.accessToken}` },
      body: form,
    },
  );

  const body = (await response.json()) as BatchUploadResponse;
  return {
    uploaded: body.uploaded,
    duplicates: body.duplicates.length + body.cross_source_duplicates.length,
    failed: body.failed,
    errors: body.errors,
  };
}
