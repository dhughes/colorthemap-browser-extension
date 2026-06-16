import { formatForMimeType, GPS_FORMATS } from "./formats";
import type { GpsFormat } from "./formats";
import {
  filenameFromContentDisposition,
  formatForFilename,
  formatForUrl,
  isAmbiguousDownloadUrl,
} from "./detection-url";

export interface SniffContext {
  contentType?: string;
  url?: string;
}

export interface SniffBodyHints extends SniffContext {
  contentDisposition?: string;
}

const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04];
const XML_HEAD_BYTES = 1024;
const decoder = new TextDecoder("utf-8", { fatal: false });

function matchesAt(
  bytes: Uint8Array,
  offset: number,
  signature: number[],
): boolean {
  if (offset + signature.length > bytes.length) {
    return false;
  }
  return signature.every((byte, i) => bytes[offset + i] === byte);
}

// Find the document's XML root element the way a parser would: the content must
// *begin* as XML once a BOM, whitespace, and the prolog (<?…?>, comments,
// DOCTYPE) are consumed. A substring search would be fooled by markup embedded
// in another format — e.g. a JSON response that quotes a file's "<gpx …>" text.
function xmlRootToken(bytes: Uint8Array): string | null {
  let s = decoder.decode(bytes.subarray(0, XML_HEAD_BYTES));
  if (s.charCodeAt(0) === 0xfeff) {
    s = s.slice(1);
  }
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\n") {
      i++;
      continue;
    }
    // First non-whitespace content must be markup, or this isn't XML at all
    // (e.g. JSON starting with '{' or '[').
    if (ch !== "<") {
      return null;
    }
    if (s.startsWith("<?", i)) {
      const end = s.indexOf("?>", i + 2);
      if (end === -1) return null;
      i = end + 2;
      continue;
    }
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      if (end === -1) return null;
      i = end + 3;
      continue;
    }
    if (s.startsWith("<!", i)) {
      const end = s.indexOf(">", i + 2);
      if (end === -1) return null;
      i = end + 1;
      continue;
    }
    const match = /^<([A-Za-z_][\w.-]*:)?([A-Za-z_][\w.-]*)/.exec(s.slice(i));
    return match ? (match[2]?.toLowerCase() ?? null) : null;
  }
  return null;
}

function isKmzCorroborated(context: SniffContext): boolean {
  const byUrl = context.url
    ? formatForUrl(context.url) === "kmz" ||
      formatForFilename(context.url) === "kmz"
    : false;
  const byMime = context.contentType
    ? formatForMimeType(context.contentType) === "kmz"
    : false;
  return byUrl || byMime;
}

export function sniffBytes(
  bytes: Uint8Array,
  context: SniffContext,
): GpsFormat | null {
  for (const spec of GPS_FORMATS) {
    const { signature } = spec;
    if (signature.kind === "bytes") {
      if (matchesAt(bytes, signature.offset, signature.bytes)) {
        return spec.format;
      }
    }
  }

  const root = xmlRootToken(bytes);
  if (root) {
    for (const spec of GPS_FORMATS) {
      if (
        spec.signature.kind === "xml-root" &&
        spec.signature.rootTokens.includes(root)
      ) {
        return spec.format;
      }
    }
  }

  if (matchesAt(bytes, 0, ZIP_MAGIC) && isKmzCorroborated(context)) {
    return "kmz";
  }

  return null;
}

export function shouldSniffBody(hints: SniffBodyHints): boolean {
  if (hints.contentType && formatForMimeType(hints.contentType) !== null) {
    return true;
  }
  if (hints.url && formatForUrl(hints.url) !== null) {
    return true;
  }
  if (hints.url && isAmbiguousDownloadUrl(hints.url)) {
    return true;
  }
  if (hints.contentDisposition) {
    const filename = filenameFromContentDisposition(hints.contentDisposition);
    if (filename && formatForFilename(filename) !== null) {
      return true;
    }
  }
  return false;
}
