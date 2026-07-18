import { CTM_BASE_URL } from "../auth/config";
import { safeFilename } from "../shared/detection-url";
import { UploadNetworkError, UploadServerError } from "./errors";
import { ctmFetch } from "./fetch-ctm";

// CTM's synchronous per-file upload response. The import is done by the time
// this returns, so success, duplicates, and parse failures are all reported
// here — no SSE needed. (The endpoint takes one file per request; the counts
// are still arrays/totals since it shares the batch response shape.)
interface TrackUploadResponse {
  uploaded: number;
  failed: number;
  track_ids: number[];
  errors: string[];
  duplicates: string[];
  cross_source_duplicates: string[];
}

// What a whole send produced, trimmed to the counts + verbatim per-file error
// lines the toast needs. Auth/network failures never reach here — they throw
// out and are classified in the handler.
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

// Uploads the files to one CTM map and reduces the results to plain counts.
// CTM's /tracks endpoint accepts exactly one file per request, so the files go
// up sequentially. A per-file server rejection (a 4xx/5xx for that file) is
// tallied and the send continues; a network failure aborts (the rest would
// fail the same way).
export async function uploadTracks(params: {
  accessToken: string;
  mapId: number;
  files: Array<{ filename: string; bytes: ArrayBuffer }>;
  baseUrl?: string;
}): Promise<BatchOutcome> {
  const baseUrl = params.baseUrl ?? CTM_BASE_URL;
  const url = `${baseUrl}/api/v1/maps/${params.mapId}/tracks`;
  const outcome: BatchOutcome = {
    uploaded: 0,
    duplicates: 0,
    failed: 0,
    errors: [],
  };

  for (let i = 0; i < params.files.length; i++) {
    const file = params.files[i]!;
    const form = new FormData();
    form.append("files", new Blob([file.bytes]), safeFilename(file.filename));

    let body: TrackUploadResponse;
    try {
      const response = await ctmFetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${params.accessToken}` },
        body: form,
      });
      body = (await response.json()) as TrackUploadResponse;
    } catch (error) {
      if (error instanceof UploadServerError) {
        outcome.failed += 1;
        outcome.errors.push(`${file.filename}: ${perFileReason(error)}`);
        continue;
      }
      // The connection dropped mid-batch. If earlier files already landed on
      // the map, don't discard them by throwing — fail this file and the rest
      // with the reason and return what we have. When nothing has landed yet,
      // rethrow so the handler shows the clean "couldn't reach CTM" card.
      if (
        error instanceof UploadNetworkError &&
        (outcome.uploaded > 0 || outcome.duplicates > 0)
      ) {
        for (const remaining of params.files.slice(i)) {
          outcome.failed += 1;
          outcome.errors.push(
            `${remaining.filename}: couldn't reach Color The Map`,
          );
        }
        return outcome;
      }
      throw error;
    }

    outcome.uploaded += body.uploaded;
    outcome.duplicates +=
      body.duplicates.length + body.cross_source_duplicates.length;
    outcome.failed += body.failed;
    outcome.errors.push(...body.errors);
  }

  return outcome;
}

// A human reason for one file's server rejection: CTM's own message when it
// gave one, otherwise mapped from the status — a bare "HTTP 400" helps nobody.
function perFileReason(error: UploadServerError): string {
  const message = error.message.trim();
  if (message !== "" && !/^HTTP \d+$/i.test(message)) {
    return message;
  }
  if (error.status === 413) {
    return "file too large";
  }
  if (error.status >= 400 && error.status < 500) {
    return "couldn't read a track from the file";
  }
  return "a server error occurred";
}
