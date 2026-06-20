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

// Reduce a filename to a bare, printable basename before it's sent to CTM (as
// the upload filename and shown as the track name). Defense-in-depth: the name
// can be influenced by the page/URL, so strip path separators, control chars,
// and shell/markup-ish characters that could carry traversal or injection
// downstream.
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = [...base]
    .filter((ch) => {
      const code = ch.codePointAt(0) ?? 0;
      return code >= 0x20 && code !== 0x7f;
    })
    .join("")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
  return cleaned || "download";
}

// A display/upload filename for a URL: its last path segment, URL-decoded, or a
// synthesized `download.<format>` when the path has no filename.
export function filenameFromUrl(
  url: string,
  fallbackFormat: GpsFormat,
): string {
  try {
    const base = decodeURIComponent(
      new URL(url).pathname.split("/").pop() ?? "",
    );
    if (base.includes(".")) {
      return base;
    }
  } catch {
    // Fall through to a synthesized name.
  }
  return `download.${fallbackFormat}`;
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
  // RFC 6266: when both are present, the extended `filename*` (percent-encoded,
  // charset-prefixed) takes precedence over the plain `filename`.
  const extended = contentDisposition.match(
    /filename\*=(?:[\w-]+'[^']*')?([^";]+)/i,
  );
  if (extended?.[1]) {
    const value = extended[1].trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  const plain = contentDisposition.match(/filename="?([^";]+)"?/i);
  return plain?.[1]?.trim() ?? null;
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
