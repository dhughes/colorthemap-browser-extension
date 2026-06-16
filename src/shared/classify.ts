import { formatForFilename, formatForUrl } from "./detection-url";
import { formatForMimeType, type GpsFormat } from "./formats";

export interface DownloadMetadata {
  url?: string;
  filename?: string;
  contentType?: string;
}

// Metadata-only classification, used where the file bytes aren't available to
// confirm (Detector B's downloads listener — the downloads API exposes no body).
// Extension first — ~95% of real downloads carry a filename/URL extension — then
// MIME. Detectors that *can* read the body (A and C) confirm with a magic-byte
// sniff instead of trusting these signals; see response-sniff.ts.
export function classifyByMetadata(meta: DownloadMetadata): GpsFormat | null {
  return (
    (meta.url ? formatForUrl(meta.url) : null) ??
    (meta.filename ? formatForFilename(meta.filename) : null) ??
    (meta.contentType ? formatForMimeType(meta.contentType) : null)
  );
}
