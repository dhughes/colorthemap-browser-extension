import { formatForFilename, linkDownloadFormat } from "./detection-url";
import { formatForMimeType, type GpsFormat } from "./formats";

export interface DownloadMetadata {
  url?: string;
  filename?: string;
  contentType?: string;
}

// Metadata-only classification, used where the file bytes aren't available to
// confirm (Detector B's downloads listener — the downloads API exposes no body).
// URL first (extension, ?format= param, or export-path segment) — most real
// downloads encode the format there — then the filename, then MIME. Detectors
// that *can* read the body (A and C) confirm with a magic-byte sniff instead of
// trusting these signals; see response-sniff.ts.
export function classifyByMetadata(meta: DownloadMetadata): GpsFormat | null {
  return (
    (meta.url ? linkDownloadFormat(meta.url) : null) ??
    (meta.filename ? formatForFilename(meta.filename) : null) ??
    (meta.contentType ? formatForMimeType(meta.contentType) : null)
  );
}
