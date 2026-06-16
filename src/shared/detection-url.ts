import { formatForExtension, GPS_FORMATS, type GpsFormat } from "./formats";

function parseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

export function formatForUrl(url: string): GpsFormat | null {
  const parsed = parseUrl(url);
  if (!parsed) {
    return null;
  }
  const path = parsed.pathname.toLowerCase();
  for (const spec of GPS_FORMATS) {
    if (spec.extensions.some((ext) => path.endsWith(ext))) {
      return spec.format;
    }
  }
  return null;
}

export function formatForFilename(filename: string): GpsFormat | null {
  const withoutQuery = filename.split(/[?#]/)[0] ?? "";
  const base = withoutQuery.split(/[\\/]/).pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot < 1) {
    return null;
  }
  return formatForExtension(base.slice(dot));
}

export function filenameFromContentDisposition(
  contentDisposition: string,
): string | null {
  const match = contentDisposition.match(
    /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i,
  );
  return match?.[1]?.trim() ?? null;
}

const DOWNLOAD_HINT_PARAMS = ["format", "token", "export", "dl", "download"];
const DOWNLOAD_HINT_PATH = /\/(download|export)(\/|$)/;

export function isAmbiguousDownloadUrl(url: string): boolean {
  const parsed = parseUrl(url);
  if (!parsed) {
    return false;
  }
  if (formatForUrl(url) !== null) {
    return false;
  }
  const hasParamHint = DOWNLOAD_HINT_PARAMS.some((param) =>
    parsed.searchParams.has(param),
  );
  const hasPathHint = DOWNLOAD_HINT_PATH.test(parsed.pathname.toLowerCase());
  return hasParamHint || hasPathHint;
}
