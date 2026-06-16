import { formatForFilename, formatForUrl } from "./detection-url";
import { formatForMimeType, type GpsFormat } from "./formats";

export interface DownloadMetadata {
  url?: string;
  filename?: string;
  contentType?: string;
}

// Extension first — ~95% of downloads carry a filename/URL extension — then
// MIME. Magic-byte sniffing is a separate, more expensive fallback for the
// remainder (see sniff.ts), used only when this returns null.
export function classifyByMetadata(meta: DownloadMetadata): GpsFormat | null {
  return (
    (meta.url ? formatForUrl(meta.url) : null) ??
    (meta.filename ? formatForFilename(meta.filename) : null) ??
    (meta.contentType ? formatForMimeType(meta.contentType) : null)
  );
}
