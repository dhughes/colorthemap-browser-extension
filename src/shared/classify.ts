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

// A response whose content-type is a "rendered" web resource is not a GPS file,
// even if its URL path ends in .gpx. SPA routes (e.g. GitHub's /blob, /_styled,
// /latest-commit endpoints) return HTML/JSON at .gpx-suffixed paths — trusting
// the extension there yields false positives. GPS files arrive as their own
// type, generic xml, octet-stream, text/plain, or no type — none of these.
export function isRenderedNonGpsContentType(contentType: string): boolean {
  const type = contentType.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type === "") {
    return false;
  }
  return (
    type === "text/html" ||
    type === "text/css" ||
    type === "application/javascript" ||
    type === "text/javascript" ||
    type.endsWith("/json") ||
    type.endsWith("+json") ||
    type.startsWith("image/") ||
    type.startsWith("video/") ||
    type.startsWith("audio/") ||
    type.startsWith("font/")
  );
}
